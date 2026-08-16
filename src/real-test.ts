/* eslint-disable no-console */
import { fetchVeloStations, getNearbyStations } from './util.ts'

declare const process: { exit: (code?: number) => never }

async function main() {
  const centralZurich = { latitude: 47.3769, longitude: 8.5417 }

  const stations = await fetchVeloStations()
  console.log(`Fetched ${stations.length} total stations.`)

  const nearby = getNearbyStations({ userLocation: centralZurich, stations })

  if (nearby.length === 0) {
    throw new Error('No stations found')
  }

  console.log(`Found ${nearby.length} nearby stations:`)
  for (const { station, distance } of nearby) {
    console.log(
      `  - ${station.name} (${distance.toFixed(0)}m): ${station.bikes} bikes, ${station.ebikes.length} ebikes`,
    )
  }
  console.log('Test passed')
}

main().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})
