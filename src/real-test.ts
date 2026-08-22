/* eslint-disable no-console */
import { distanceInMeters, fetchVeloMap, fetchVeloStation } from './util.ts'

declare const process: { exit: (code?: number) => never }

async function main() {
  const centralZurich = { latitude: 47.3769, longitude: 8.5417 }

  const mapStations = await fetchVeloMap()
  console.log(`Fetched ${mapStations.length} total stations on map.`)

  const [nearest] = mapStations
    .map(station => ({ station, distance: distanceInMeters(centralZurich, station.pos) }))
    .sort((a, b) => a.distance - b.distance)

  if (!nearest) {
    throw new Error('No stations found on map')
  }

  console.log(`Fetching details for nearest station (id: ${nearest.station.id}, ${nearest.distance.toFixed(0)}m away)...`)
  const details = await fetchVeloStation(nearest.station.id)
  console.log('Full station details:', JSON.stringify(details, null, 2))
  console.log('Test passed')
}

main().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})
