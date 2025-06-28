/* @refresh reload */

import type { Resource } from 'solid-js'
import { createMemo, createResource, createSignal, For, Show } from 'solid-js'
import { render } from 'solid-js/web'

import { batterySort, batteryVoltage36v, dependOn, reconcileStations, stationsFetcher } from './util'

const LOCAL_DEBUG = import.meta.env.DEV
const TESTDATA_URL = './testdata'

const MAX_SHOWN_EBIKES = 6
export const MAX_STATIONS = 10
export const MAX_DISTANCE_IN_METERS = 1000
const PUBLIBIKE_STATION_URL = 'https://publibike-api.delroth.net/v1/public/stations'
const VELOSPOT_STATION_URL = 'https://velospot.info/customer/public/api/pbvsng'
const NO_REFERRER = { referrerPolicy: 'no-referrer' } as RequestInit

export interface LatLon {
  latitude: number
  longitude: number
}

type Operator = 'publibike' | 'velospot'

enum BikeType { Bike = 1, EBike = 2 }

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

function fetchUserLocation() {
  if (LOCAL_DEBUG) {
    return new Promise<LatLon>((resolve, _reject) => setTimeout(() => {
      resolve({ latitude: 47.38752933398596, longitude: 8.52717 } as LatLon)
    }, 500))
  }
  return new Promise<LatLon>((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude, longitude } }) => resolve({ latitude, longitude } as LatLon),
      positionError => reject(positionError.message),
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 0,
      },
    ),
  )
}

async function fetchPubliMap() {
  const response = await fetch(
    LOCAL_DEBUG
      ? `${TESTDATA_URL}/publibike.stations.json`
      : PUBLIBIKE_STATION_URL,
    { cache: 'force-cache' },
  )
  const json = await response.json() as any[]
  return json.map(({ id, latitude, longitude }) => ({
    id,
    pos: { latitude, longitude } as LatLon,
  } as StationRef))
}

async function fetchVeloMap() {
  const response = await fetch(
    LOCAL_DEBUG
      ? `${TESTDATA_URL}/velospot.stations.json`
      : `${VELOSPOT_STATION_URL}/stations`,
    { cache: 'force-cache', ...NO_REFERRER },
  )
  const json = await response.json() as any[]
  return json.map(({ id, latitude, longitude }) => ({
    id,
    pos: { latitude, longitude } as LatLon,
  } as StationRef))
}

async function fetchPubliStation(id: string) {
  const response = await fetch(
    LOCAL_DEBUG
      ? `${TESTDATA_URL}/publibike.${id}.json`
      : `${PUBLIBIKE_STATION_URL}/${id}`,
    { ...NO_REFERRER },
  )
  const { name, latitude, longitude, vehicles }: {
    name: string
    latitude: number
    longitude: number
    vehicles: any[]
  } = await response.json()
  const bikes = vehicles.filter(({ type }) => type.id === BikeType.Bike).length
  const ebikes = vehicles
    .filter(({ type }: any) => type.id === BikeType.EBike)
    .map(({ name, ebike_battery_level }: any) => ({
      operator: 'publibike',
      name,
      battery: ebike_battery_level || Number.NaN,
    } as EBike))
    .sort(batterySort)
  return {
    id,
    name,
    pos: { latitude, longitude } as LatLon,
    bikes,
    ebikes,
  } as Station
}

async function fetchVeloStation(id: string) {
  const response = await fetch(
    LOCAL_DEBUG
      ? `${TESTDATA_URL}/velospot.${id}.json`
      : `${VELOSPOT_STATION_URL}/stationDetails?${new URLSearchParams({ stationId: id }).toString()}`,
  )
  const { name, latitude, longitude, vehicles }: any = await response.json()
  return {
    id,
    name: name.replace(/\s-\s[^\s-]+$/, ''), // Useless city suffix like " - Zürich".
    pos: { latitude, longitude } as LatLon,
    bikes: vehicles
      .filter(({ type }: { type: number }) => type === BikeType.Bike)
      .length,
    ebikes: vehicles
      .filter(({ type }: { type: number }) => type === BikeType.EBike)
      .map(({ name, voltage }: { name: string, voltage: number }) => ({
        operator: 'velospot',
        name: name.replace(/e$/, ''),
        battery: Math.round(batteryVoltage36v(voltage)),
      } as EBike))
      .sort(batterySort),
  } as Station
}

function ebikeBattery(ebike: EBike) {
  const { name, battery, operator } = ebike
  return (
    <div class="ebike-battery" classList={{ old: operator === 'publibike' }}>
      {ebikeBatteryBar(ebike)}
      <span>{name}</span>
      <Show when={!Number.isNaN(battery)}>
        <span>
          {battery.toFixed(0)}
          %
        </span>
      </Show>
    </div>
  )
}

function batteryRow(props: { ebikes: EBike[], visible: boolean }) {
  const { ebikes, visible } = props
  return (
    <Show when={visible}>
      <tr class="battery-row">
        <td colSpan={5}>
          <div><For each={ebikes} children={ebikeBattery} /></div>
        </td>
      </tr>
    </Show>
  )
}

function ebikeBatteryBar(ebike: EBike) {
  if (Number.isNaN(ebike.battery))
    return <div class="battery-bar unknown" />
  return (
    <div class="battery-bar" title={`${ebike.battery.toFixed(0)}%`}>
      <span style={{ '--level': ebike.battery.toFixed(0) }} />
    </div>
  )
}

function stationRow(props: WithDistance<Station>) {
  const { distance, station } = props
  const { latitude, longitude } = station.pos
  const [barVisible, setBarVisible] = createSignal(false)
  const hasEbikes = station.ebikes.length > 0
  const shownEbikes = station.ebikes.slice(0, MAX_SHOWN_EBIKES)
  return (
    <>
      <tr onClick={() => hasEbikes && setBarVisible(!barVisible())} classList={{ 'is-open': barVisible() }}>
        <td class="align-left">
          <a href={`https://maps.google.com/maps?q=${latitude},${longitude}`} rel="noopener noreferrer" target="_blank">
            {station.name}
          </a>
        </td>
        <td>
          {distance.toFixed(0)}
          m
        </td>
        <td>{station.bikes}</td>
        <td>{station.ebikes.length}</td>
        <td class="align-left batteries">
          <For each={shownEbikes} children={ebikeBatteryBar} />
        </td>
      </tr>
      {station.ebikes.length > 0 ? batteryRow({ ebikes: shownEbikes, visible: barVisible() }) : null}
    </>
  )
}

function loader(resource: Resource<any>, label: string) {
  return (
    <>
      <input type="checkbox" checked={resource.state === 'ready'} disabled classList={{ error: resource.error !== undefined }} />
      <label classList={{ error: resource.error !== undefined }}>
        {label}
        {new Set(['pending', 'refreshing']).has(resource.state) ? '…' : ''}
        <Show when={resource.state === 'errored'}>
          <p class="error">
            Error:
            {' '}
            {resource.error?.message}
          </p>
        </Show>
      </label>
    </>
  )
}

function App() {
  const [userLocation, { refetch: refetchUserLocation }] = createResource(fetchUserLocation)
  const [publiMap] = createResource(fetchPubliMap)
  const [veloMap] = createResource(fetchVeloMap)
  const [publiStations] = createResource(...dependOn({ userLocation, stations: publiMap }, stationsFetcher(fetchPubliStation)))
  const [veloStations] = createResource(...dependOn({ userLocation, stations: veloMap }, stationsFetcher(fetchVeloStation)))
  const [stations] = createResource(...dependOn({ publiStations, veloStations }, reconcileStations))

  const isFullyReady = createMemo(() => new Set(['ready', 'refreshing']).has(stations.state))
  const hasError = createMemo(() => userLocation.error !== undefined || publiMap.error !== undefined || veloMap.error !== undefined || publiStations.error !== undefined || veloStations.error !== undefined)
  const canRefresh = createMemo(() => isFullyReady() || hasError())
  const isRefreshing = createMemo(() => userLocation.state === 'refreshing' || publiMap.state === 'refreshing' || veloMap.state === 'refreshing' || publiStations.state === 'refreshing' || veloStations.state === 'refreshing')

  return (
    <>
      <h1>PubliBike Locator</h1>
      <main>
        <Show
          when={isFullyReady()}
          fallback={(
            <aside id="loading">
              {loader(userLocation, 'GPS location')}
              {loader(publiMap, 'PubliBike map')}
              {loader(veloMap, 'Velospot map')}
              {loader(publiStations, 'PubliBike stations')}
              {loader(veloStations, 'Velospot stations')}
            </aside>
          )}
        >
          <table id="stations">
            <thead>
              <tr>
                <th class="align-left">Name</th>
                <th>Dist</th>
                <th>B</th>
                <th>EB</th>
                <th class="align-left">Bat</th>
              </tr>
            </thead>
            <tbody>
              <For each={stations()} children={stationRow} />
            </tbody>
          </table>
        </Show>
      </main>
      <Show when={canRefresh()}>
        <button type="button" id="refresh" disabled={isRefreshing()} onClick={refetchUserLocation}>
          {isRefreshing() ? 'Refreshing…' : 'Refresh'}
        </button>
      </Show>
      <footer>
        Unofficial PubliBike / Velospot lookup tool
        {' ⋅ '}
        <a href="https://github.com/delroth/publibike-locator" rel="noopener noreferrer" target="_blank">Code</a>
        {' ⋅ '}
        <a href="https://github.com/delroth/publibike-locator/issues" rel="noopener noreferrer" target="_blank">Issues</a>
      </footer>
    </>
  )
}

render(() => <App />, document.getElementById('app')!)
