import type { Resource } from 'solid-js'

export const MAX_SHOWN_EBIKES = 6
export const MAX_STATIONS = 10
export const MAX_DISTANCE_IN_METERS = 1000
export const TESTDATA_URL = './testdata'
export const VELOSPOT_STATION_URL = 'https://velospot.info/customer/public/api/pbvsng'
export const NO_REFERRER = { referrerPolicy: 'no-referrer' } as RequestInit

export const API_AUTHENTICATION_KEY = (() => {
  const rot13 = (s: string) =>
    s.replace(/[a-z]/gi, (char) => {
      const code = char.charCodeAt(0)
      const base = char <= 'Z' ? 65 : 97
      return String.fromCharCode(((code - base + 13) % 26) + base)
    })
  // much H3CK4R, very secure.
  return rot13('eOyVGmxCSeSeyWr$mR7B')
})()

export const DEFAULT_HEADERS: Record<string, string> = {
  'accept': 'application/json, text/plain, */*',
  'accept-language': 'en',
  'user-agent': 'Dart/3.12 (dart:io)',
  'x-timezone': 'CEST',
}

export interface LatLon {
  latitude: number
  longitude: number
}

export type Operator = 'publibike' | 'velospot'

export enum BikeType { Bike = 1, EBike = 2 }

export interface StationRef {
  id: string
  pos: LatLon
}

export interface EBike {
  operator: Operator
  name: string
  battery: number
}

export interface Station extends StationRef {
  name: string
  bikes: number
  ebikes: EBike[]
}

export interface WithDistance<T> {
  station: T
  distance: number
}

export interface ApiVehicle {
  id?: string
  name: string
  type: number
  voltage?: number
  lock_type?: number
  ebike_km_potential?: string
  lock_number?: string
  [key: string]: unknown
}

export interface ApiStationDetails {
  id: string
  latitude: number
  longitude: number
  name: string
  address?: string
  out_of_service?: boolean
  vehicles?: ApiVehicle[]
  [key: string]: unknown
}

export interface ApiVehicleCount {
  count: number
  type: number
}

export interface ApiStationMap {
  id: string
  latitude: number
  longitude: number
  out_of_service?: boolean
  available_vehicles?: ApiVehicleCount[]
}

export function cleanStationName(name: string): string {
  const lastIndex = name.lastIndexOf(' - ')
  if (lastIndex !== -1) {
    const stripped = name.slice(0, lastIndex).trim()
    if (stripped.length > 0)
      return stripped
  }
  return name.trim()
}

export function parseStationDetails(data: ApiStationDetails): Station {
  const vehicles = data.vehicles ?? []
  const bikes = vehicles.filter(v => v.type === BikeType.Bike).length
  const ebikes: EBike[] = vehicles
    .filter(v => v.type === BikeType.EBike)
    .map((v) => {
      const voltage = v.voltage ?? Number.NaN
      const battery = v.lock_type === 1 ? Math.round(batteryVoltage36v(voltage)) : voltage
      return {
        operator: 'velospot' as Operator,
        name: v.name.replace(/e$/, ''),
        battery,
      }
    })
    .sort(batterySort)

  return {
    id: data.id,
    name: cleanStationName(data.name),
    pos: {
      latitude: data.latitude,
      longitude: data.longitude,
    },
    bikes,
    ebikes,
  }
}

export async function fetchVeloStation(
  id: string,
  url: string = `${VELOSPOT_STATION_URL}/stationDetails?${new URLSearchParams({ stationId: id }).toString()}`,
  init: RequestInit = NO_REFERRER,
): Promise<Station> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...DEFAULT_HEADERS,
      ApiAuthenticationKey: API_AUTHENTICATION_KEY,
      ...init.headers,
    },
  })
  const json = await response.json() as ApiStationDetails
  return parseStationDetails(json)
}

export async function fetchVeloMap(
  url: string = `${VELOSPOT_STATION_URL}/stations`,
  init: RequestInit = NO_REFERRER,
): Promise<StationRef[]> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...DEFAULT_HEADERS,
      ...init.headers,
    },
  })
  const json = await response.json() as ApiStationMap[]
  return json.map(({ id, latitude, longitude }) => ({
    id,
    pos: { latitude, longitude } as LatLon,
  }))
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

export function batterySort(a: EBike, b: EBike) {
  return (b.battery || 0) - (a.battery || 0)
}

export function distanceSort(a: WithDistance<any>, b: WithDistance<any>) {
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

export function getNearbyStations({ userLocation, stations }: { userLocation: LatLon, stations: Station[] }): WithDistance<Station>[] {
  return stations
    .map(station => ({ station, distance: distanceInMeters(userLocation, station.pos) }))
    .filter(({ distance }) => distance <= MAX_DISTANCE_IN_METERS)
    .sort(distanceSort)
    .slice(0, MAX_STATIONS)
}

// Haversine formula.
export function distanceInMeters(pos1: LatLon, pos2: LatLon): number {
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

// Why is this not built-in to solid-js?
export function dependOn<
  TResources extends Record<string, Resource<any>>,
  TResult extends { [K in keyof TResources]: ReturnType<TResources[K]> },
  Out,
>(
  resources: TResources,
  actor: (source: TResult) => Out | Promise<Out>,
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
