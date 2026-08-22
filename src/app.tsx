/* @refresh reload */

import type { Resource } from 'solid-js'
import type { EBike, LatLon, Station, WithDistance } from './util'
import { createMemo, createResource, createSignal, For, Show } from 'solid-js'

import { render } from 'solid-js/web'
import {
  dependOn,
  fetchVeloMap,
  fetchVeloStation,
  MAX_SHOWN_EBIKES,
  NO_REFERRER,
  stationsFetcher,
  TESTDATA_URL,
  VELOSPOT_STATION_URL,
} from './util'

const LOCAL_DEBUG = import.meta.env.DEV

function fetchUserLocation() {
  if (LOCAL_DEBUG) {
    return new Promise<LatLon>((resolve, _reject) => setTimeout(() => {
      // Central Zurich (near Zürich HB / Central)
      resolve({ latitude: 47.3769, longitude: 8.5417 } as LatLon)
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

function fetchAppMap() {
  return fetchVeloMap(
    LOCAL_DEBUG
      ? `${TESTDATA_URL}/velospot.stations.json`
      : `${VELOSPOT_STATION_URL}/stations`,
    { cache: 'force-cache', ...NO_REFERRER },
  )
}

function fetchAppStation(id: string) {
  return fetchVeloStation(
    id,
    LOCAL_DEBUG
      ? `${TESTDATA_URL}/velospot.${id}.json`
      : `${VELOSPOT_STATION_URL}/stationDetails?${new URLSearchParams({ stationId: id }).toString()}`,
  )
}

function ebikeBattery(ebike: EBike) {
  const { name, battery } = ebike
  return (
    <div class="ebike-battery">
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
  return (
    <Show when={props.visible}>
      <tr class="battery-row">
        <td colSpan={5}>
          <div><For each={props.ebikes} children={ebikeBattery} /></div>
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
  const [barVisible, setBarVisible] = createSignal(false)
  const hasEbikes = () => props.station.ebikes.length > 0
  const shownEbikes = () => props.station.ebikes.slice(0, MAX_SHOWN_EBIKES)
  return (
    <>
      <tr onClick={() => hasEbikes() && setBarVisible(!barVisible())} classList={{ 'is-open': barVisible() }}>
        <td class="align-left">
          <a href={`https://maps.google.com/maps?q=${props.station.pos.latitude},${props.station.pos.longitude}`} rel="noopener noreferrer" target="_blank">
            {props.station.name}
          </a>
        </td>
        <td>
          {props.distance.toFixed(0)}
          m
        </td>
        <td>{props.station.bikes}</td>
        <td>{props.station.ebikes.length}</td>
        <td class="align-left batteries">
          <For each={shownEbikes()} children={ebikeBatteryBar} />
        </td>
      </tr>
      {props.station.ebikes.length > 0 ? batteryRow({ ebikes: shownEbikes(), visible: barVisible() }) : null}
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
  const [veloStations, { refetch: refetchVeloStations }] = createResource(fetchAppMap)
  const [stations] = createResource(...dependOn({ userLocation, stations: veloStations }, stationsFetcher(fetchAppStation)))

  const isFullyReady = createMemo(() => new Set(['ready', 'refreshing']).has(stations.state))
  const hasError = createMemo(() => userLocation.error !== undefined || veloStations.error !== undefined || stations.error !== undefined)
  const canRefresh = createMemo(() => isFullyReady() || hasError())
  const isRefreshing = createMemo(() => userLocation.state === 'refreshing' || veloStations.state === 'refreshing' || stations.state === 'refreshing')

  const refreshAll = () => {
    refetchUserLocation()
    refetchVeloStations()
  }

  return (
    <>
      <h1>PubliBike / Velospot Locator</h1>
      <main>
        <Show
          when={isFullyReady()}
          fallback={(
            <aside id="loading">
              {loader(userLocation, 'GPS location')}
              {loader(veloStations, 'Velospot stations')}
              {loader(stations, 'Nearby stations')}
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
        <button type="button" id="refresh" disabled={isRefreshing()} onClick={refreshAll}>
          {isRefreshing() ? 'Refreshing…' : 'Refresh'}
        </button>
      </Show>
      <footer>
        Unofficial Velospot lookup tool
        {' ⋅ '}
        <a href="https://github.com/delroth/publibike-locator" rel="noopener noreferrer" target="_blank">Code</a>
        {' ⋅ '}
        <a href="https://github.com/delroth/publibike-locator/issues" rel="noopener noreferrer" target="_blank">Issues</a>
      </footer>
    </>
  )
}

render(() => <App />, document.getElementById('app')!)
