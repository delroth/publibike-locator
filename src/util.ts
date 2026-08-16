import type { Resource } from 'solid-js'

export const MAX_SHOWN_EBIKES = 6
export const MAX_STATIONS = 10
export const MAX_DISTANCE_IN_METERS = 1000
export const TESTDATA_URL = './testdata'
export const PUBLIBIKE_STATIONS_URL = 'https://rest.publibike.ch/v1/public/all/stations'
export const VELOSPOT_STATION_URL = PUBLIBIKE_STATIONS_URL
export const NO_REFERRER = { referrerPolicy: 'no-referrer' } as RequestInit

export const DEFAULT_HEADERS: Record<string, string> = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.5',
  'Origin': 'https://www.publibike.ch',
  'Referer': 'https://www.publibike.ch/',
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

export interface ApiVelospotStation {
  station_id: string
  station_name: string
  station_address?: string
  lat: string
  lng: string
  totalBike?: number
  totalNonElectricalBike?: number
  totalElectricalBike?: number
  totalCargoBike?: number
  totalEscooter?: number
  totalGlider?: number
  stationNumber?: string
  [key: string]: unknown
}

export interface ApiStationsResponse {
  publibike?: {
    stations?: unknown[]
  }
  velospot?: {
    responseData?: ApiVelospotStation[]
    [key: string]: unknown
  }
  [key: string]: unknown
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

export function parseStations(data: ApiStationsResponse | ApiVelospotStation[]): Station[] {
  const rawStations: ApiVelospotStation[] = Array.isArray(data)
    ? data
    : (data?.velospot?.responseData ?? [])

  return rawStations.map((station) => {
    const bikes = station.totalNonElectricalBike ?? 0
    const ebikesCount = station.totalElectricalBike ?? 0
    const ebikes: EBike[] = Array.from({ length: ebikesCount }, (_, i) => ({
      operator: 'velospot',
      name: `EBike ${i + 1}`,
      battery: Number.NaN,
    }))
    const rawName = station.station_name || `Station #${station.stationNumber || station.station_id}`
    return {
      id: station.station_id || station.stationNumber || '',
      name: cleanStationName(rawName),
      pos: {
        latitude: Number.parseFloat(station.lat),
        longitude: Number.parseFloat(station.lng),
      },
      bikes,
      ebikes,
    }
  })
}

export async function fetchStations(
  url: string = PUBLIBIKE_STATIONS_URL,
  init: RequestInit = {},
): Promise<Station[]> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...DEFAULT_HEADERS,
      ...init.headers,
    },
  })
  const json = await response.json() as ApiStationsResponse
  return parseStations(json)
}

export const fetchVeloStations = fetchStations

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
