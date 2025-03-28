import type { Resource } from 'solid-js'

import type { EBike, LatLon, StationRef, Station, WithDistance } from './app'
import { MAX_DISTANCE_IN_METERS, MAX_STATIONS } from './app'

export function batterySort(a: EBike, b: EBike) {
  return (b.battery || 0) - (a.battery || 0)
}

function distanceSort(a: WithDistance<any>, b: WithDistance<any>) {
  return a.distance - b.distance
}

export function batteryVoltage36v(voltage: number): number {
  if (!voltage || Number.isNaN(voltage))
    return Number.NaN
  const V_max = 42.3 // Fully charged voltage
  const V_min = 34.0 // Fully discharged voltage
  const b_typical = 0.03 // Steepness factor
  const c_typical = 50 // Midpoint (50% State of Charge)
  if (voltage > V_max)
    return 100
  if (voltage < V_min)
    return 0
  return Math.max(0, Math.min(100, c_typical - (1 / b_typical) * Math.log((V_max - voltage) / (voltage - V_min))))
}

export function stationsFetcher(fetcher: (id: string) => Promise<Station>) {
  return async ({ userLocation, stations }: { userLocation: LatLon, stations: StationRef[] }) => {
    const near = stations
      .map(station => ({ station, distance: distanceInMeters(userLocation, station.pos) }))
      .filter(({ distance }) => distance <= MAX_DISTANCE_IN_METERS)
      .sort(distanceSort)
      .slice(0, MAX_STATIONS)
    const promises = await Promise.allSettled(near.map(
      async ({ distance, station: { id } }) => ({ distance, station: await fetcher(id) } as WithDistance<Station>),
    ))
    return promises
      .filter(({ status }) => status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<WithDistance<Station>>).value)
  }
}

// Haversine formula.
function distanceInMeters(pos1: LatLon, pos2: LatLon): number {
  const degToRad = (angle: number): number => angle * Math.PI / 180
  const EARTH_DIAMETER_METERS = 12742000
  const latDiff = degToRad(pos2.latitude - pos1.latitude)
  const lonDiff = degToRad(pos2.longitude - pos1.longitude)
  const a = Math.sin(latDiff / 2) * Math.sin(latDiff / 2)
    + Math.cos(degToRad(pos1.latitude)) * Math.cos(degToRad(pos2.latitude))
    * Math.sin(lonDiff / 2) * Math.sin(lonDiff / 2)
  const c = Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_DIAMETER_METERS * c
}

// Merge stations from two sets if they are close enough or have the same name.
export async function reconcileStations({ publiStations, veloStations }: { publiStations: WithDistance<Station>[], veloStations: WithDistance<Station>[] }) {
  const output: WithDistance<Station>[] = []
  const IS_SAME_THRESHOLD_IN_METERS = 12.0 // Max seen so far: 11m.
  const mergedPb = new Set<number>()
  const mergedVelo = new Set<number>()
  for (let i = 0; i < publiStations.length; i++) {
    const publi = publiStations[i]
    for (let j = 0; j < veloStations.length; j++) {
      if (mergedVelo.has(j))
        continue
      const velo = veloStations[j]
      if (publi.station.name.toLowerCase() === velo.station.name.toLowerCase()
        || distanceInMeters(publi.station.pos, velo.station.pos) <= IS_SAME_THRESHOLD_IN_METERS) {
        // Prefer Velospot over PubliBike.
        const merged = { ...velo }
        // By design bikes are only in the PubliBike network.
        merged.station.bikes = publi.station.bikes
        // By design ebikes can only belong to either network, so no need to dedupe.
        merged.station.ebikes.push(...publi.station.ebikes)
        merged.station.ebikes.sort(batterySort)
        output.push(merged)
        mergedPb.add(i)
        mergedVelo.add(j)
        break
      }
    }
  }
  // In the unlikely case we couldn't merge stations, add them as-is.
  output.push(
    ...publiStations.filter((_, i) => !mergedPb.has(i)),
    ...veloStations.filter((_, j) => !mergedVelo.has(j)),
  )
  output.sort(distanceSort)
  return output
}

// Why is this not built-in to solid-js?
export function dependOn<
  TResources extends Record<string, Resource<any>>,
  TResult extends { [K in keyof TResources]: ReturnType<TResources[K]> },
  Out,
>(
  resources: TResources,
  actor: (source: TResult) => Promise<Out>,
) {
  const resolver = (): TResult | undefined => {
    for (const key in resources) {
      if (resources[key].state !== 'ready') {
        return undefined
      }
    }
    const out = {} as TResult
    for (const key in resources) {
      out[key] = resources[key]()
    }
    return out
  }
  const fetcher = async (source: TResult | undefined) => {
    if (source === undefined) {
      throw new Error('not ready')
    }
    return await actor(source)
  }
  return [resolver, fetcher] as const
}
