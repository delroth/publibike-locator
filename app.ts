// Ignore results more than 1000m away.
const DISTANCE_THRESHOLD_METERS = 1000;

// Show the N closest stations.
const STATIONS_COUNT_TO_TRACK = 10;

// Number of battery levels to display.
const BEST_BATTERY_COUNT = 4;
const BATTERY_STYLES: [number, string, string][] = [
    // Min. level, character, class name (for color).
    [80, '\u{2588}', 'bat-nice'],
    [40, '\u{2586}', 'bat-meh'],
    [20, '\u{2584}', 'bat-ugh'],
    [-Infinity, '\u{2581}', 'bat-zero'],
];
const UNKNOWN_BAT = -1;

const DEBUG_LOCAL = false;
const TESTDATA_URL = "http://0.0.0.0:3000";

// API base.
const PUBLIBIKE_STATION_URL = "https://publibike-api.delroth.net/v1/public/stations";
const VELOSPOT_STATION_URL = "https://velospot-api.delroth.net/customer/public/api/pbvsng";
const VELOSPOT_TYPE_BIKE = 1;  // TODO: unknown, not supported yet.
const VELOSPOT_TYPE_EBIKE = 2;

// List of Shiny (Special Edition) bikes. Crowdsourced list.
const SHINY_BIKES = [
    104951,
    503674,
    504027,
];

enum BikeType { Bike = 1, EBike = 2 }

interface LatLon {
    lat: number;
    lon: number;
}

type StationType = "publibike" | "velospot";

interface LightStation {
    type: StationType;
    id: string;
    pos: LatLon;
}

interface LightStationWithCount extends LightStation {
    bikes: number;
    ebikes: number;
}

interface EBike {
    type: StationType;
    name: string;
    battery: number;
}

interface FullStation extends LightStation {
    name: string;
    bikes: number;
    ebikes: EBike[];
}

interface WithDistance<StationType> {
    station: StationType;
    distance: number;
}

interface VelospotVehicleCount {
    count: number;
    type: number;
}

interface VelospotVehicle {
    id: string
    name: string // actualName.lpad(0, 6) + 'e': 4411 -> 004411e
    type: number
    // Two digits, seems to max at ~42. Probably a 36V battery pack.
    voltage: number
    ebike_km_potential: string // 61-70km
    lock_number: string // '198' + actualName.lpad(0, 5): 4411 -> 19804411
}

interface Getter {
    stations(): Promise<LightStation[]>;
    station(id: string): Promise<FullStation>;
}

class PublibikeGetter implements Getter {
    private stationsUrl(): string {
        return DEBUG_LOCAL
            ? `${TESTDATA_URL}/publibike.stations.json`
            : PUBLIBIKE_STATION_URL;
    }
    async stations(): Promise<LightStation[]> {
        const response = await fetch(this.stationsUrl());
        const json = await response.json();
        return json.map(({ id, latitude: lat, longitude: lon }) => <LightStation>{
            type: "publibike",
            id,
            pos: <LatLon>{ lat, lon },
        });
    }

    private stationUrl(id: string): string {
        return DEBUG_LOCAL
            ? `${TESTDATA_URL}/publibike.${id}.json`
            : `${PUBLIBIKE_STATION_URL}/${id}`;
    }
    async station(id: string): Promise<FullStation> {
        const response = await fetch(this.stationUrl(id));
        const { name, latitude: lat, longitude: lon, vehicles } = await response.json();
        const bikes = vehicles.filter(({ type }) => type.id === BikeType.Bike).length;
        const ebikes = vehicles
            .filter(({ type }) => type.id === BikeType.EBike)
            .map(v => <EBike>{
                type: "publibike",
                name: v.name,
                battery: v.ebike_battery_level || UNKNOWN_BAT,
            })
            .sort((a, b) => b.battery - a.battery);
        return <FullStation>{
            type: "publibike",
            id,
            name,
            pos: <LatLon>{ lat, lon },
            bikes: bikes,
            ebikes,
        };
    }
}

class VelospotGetter implements Getter {
    private stationsUrl(): string {
        return DEBUG_LOCAL
            ? `${TESTDATA_URL}/velospot.stations.json`
            : `${VELOSPOT_STATION_URL}/stations`;
    }
    async stations(): Promise<LightStation[]> {
        const response = await fetch(this.stationsUrl());
        const json = await response.json();
        return json
            .filter(({ out_of_service }) => !out_of_service)
            .map(({ id, latitude: lat, longitude: lon, available_vehicles: vehicles }) => <LightStation>{
                type: "velospot",
                id,
                pos: <LatLon>{ lat, lon },
                // bikes: (vehicles as VelospotVehicleCount[]).filter(({ type }) => type === VELOSPOT_TYPE_BIKE)[0]?.count ?? 0,
                // ebikes: (vehicles as VelospotVehicleCount[]).filter(({ type }) => type === VELOSPOT_TYPE_EBIKE)[0]?.count ?? 0,
            })
    }

    private stationUrl(id: string): string {
        return DEBUG_LOCAL
            ? `${TESTDATA_URL}/velospot.${id}.json`
            : `${VELOSPOT_STATION_URL}/stationDetails?${new URLSearchParams({ stationId: id }).toString()}`;
    }
    async station(id: string): Promise<FullStation> {
        const response = await fetch(this.stationUrl(id));
        const { name, vehicles, latitude: lat, longitude: lon } = await response.json();
        return <FullStation>{
            type: "velospot",
            id,
            pos: <LatLon>{ lat, lon },
            name: name.replace(/\s-\s[^\s-]+$/, ''),  // Useless network (city) suffix like " - Zürich".
            bikes: 0,  // TODO once supported.
            ebikes: (vehicles as VelospotVehicle[])
                .filter(({ type }) => type === VELOSPOT_TYPE_EBIKE)
                .map(({ name, voltage }) => <EBike>{
                    type: "velospot",
                    name: name.replace(/e$/, ''),
                    battery: Math.round(batteryVoltage36v(voltage)),
                })
                .sort((a, b) => b.battery - a.battery),
        }
    }
}

// Haversine formula.
function CoordsDistance(pos1: LatLon, pos2: LatLon): number {
    function DegToRad(angle) {
        return angle * Math.PI / 180;
    }

    const EARTH_DIAMETER_METERS = 12742000;
    const lat_diff = DegToRad(pos2.lat - pos1.lat);
    const lon_diff = DegToRad(pos2.lon - pos1.lon);
    const a =
        Math.sin(lat_diff / 2) * Math.sin(lat_diff / 2) +
        Math.cos(DegToRad(pos1.lat)) * Math.cos(DegToRad(pos2.lat)) *
        Math.sin(lon_diff / 2) * Math.sin(lon_diff / 2);
    const c = Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_DIAMETER_METERS * c;
}

// Get the N closest stations to the user, sorted by ascending distance.
function ComputeStationsToTrack<SType extends LightStation>(stations: SType[], userLoc: LatLon): WithDistance<SType>[] {
    return stations.map(
        station => <WithDistance<SType>>{
            station: station,
            distance: CoordsDistance(userLoc, station.pos),
        })
        .sort((s1, s2) => s1.distance - s2.distance)
        .filter(swd => swd.distance <= DISTANCE_THRESHOLD_METERS)
        .slice(0, STATIONS_COUNT_TO_TRACK);
}

// Get location from browser navigator API.
function GetUserLocation() {
    if (DEBUG_LOCAL) {
        return new Promise<LatLon>((resolve, reject) => {
            resolve(<LatLon>{ lat: 47.38752933398596, lon: 8.52717 });
        })
    }
    if ("geolocation" in navigator) {
        return new Promise<LatLon>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                position => {
                    resolve(<LatLon>{
                        lat: position.coords.latitude,
                        lon: position.coords.longitude
                    });
                },
                positionError => reject(positionError.message),
                {
                    enableHighAccuracy: true,
                    timeout: 10_000,
                    maximumAge: 0,
                });
        });
    } else {
        throw "Your web browser does not support the web location API.";
    }
}

function MapsUrlFromCoords(pos: LatLon) {
    return `https://maps.google.com/maps?q=${pos.lat},${pos.lon}`;
}

function FormatDistance(meters: number): string {
    if (meters < 1000) {
        return Math.round(meters) + "m";
    } else {
        return (Math.round(meters / 100) / 10) + "km";
    }
}

function FormatEBike(eb: EBike): string {
    const bat = eb.battery == UNKNOWN_BAT ? '' : ` (${eb.battery}%)`;
    return `${eb.name}${bat}`;
}

function ReconcileStations(pbStations: WithDistance<FullStation>[], veloStations: WithDistance<FullStation>[]): WithDistance<FullStation>[] {
    const output: WithDistance<FullStation>[] = [];
    // Merge stations if they are close enough or have similar name. Max seen so far: 11m.
    const IS_SAME_THRESHOLD_IN_METERS = 12.0;
    const mergedPb = new Set<number>(), mergedVelo = new Set<number>();
    for (let i = 0; i < pbStations.length; i++) {
        const pb = pbStations[i];
        for (let j = 0; j < veloStations.length; j++) {
            if (mergedVelo.has(j)) continue;
            const velo = veloStations[j];
            if (pb.station.name.toLowerCase() === velo.station.name.toLowerCase()
                || CoordsDistance(pb.station.pos, velo.station.pos) <= IS_SAME_THRESHOLD_IN_METERS) {
                // Prefer Velospot over Publibike.
                const merged = { ...velo };
                merged.station.bikes = pb.station.bikes;
                // By definition ebikes can only belong to one type at a time.
                merged.station.ebikes.push(...pb.station.ebikes);
                merged.station.ebikes.sort((a, b) => b.battery - a.battery);
                output.push(merged);
                mergedPb.add(i);
                mergedVelo.add(j);
                break;
            }
        }
    }
    // In the unlikely case we couldn't merge stations, add them as-is.
    output.push(
        ...pbStations.filter((_, i) => !mergedPb.has(i)),
        ...veloStations.filter((_, j) => !mergedVelo.has(j)))
    output.sort((a, b) => a.distance - b.distance);
    return output;
}

(async function () {
    const $status = document.getElementById('status');
    const $station_table = document.getElementById('stations-table');
    const $station_list = document.getElementById('stations-list');

    document.getElementById('reload')
        .addEventListener('click', async function (e) {
            const that = this as HTMLButtonElement;
            that.disabled = true;
            setTimeout(() => that.disabled = false, 400);
            await Load();
        });

    function Status(message: string) {
        $status.textContent = message;
    }

    function Error(message: string) {
        $status.textContent = message;
        $status.classList.add("error");
    }

    async function Load() {
        const pb = new PublibikeGetter();
        const velo = new VelospotGetter();

        Status("Fetching stations and location…");
        let userLoc, allPbStations, allVeloStations;
        try {
            [userLoc, allPbStations, allVeloStations] = await Promise.all([
                GetUserLocation(),
                pb.stations(),
                velo.stations(),
            ]);
        } catch (err) {
            Error(err);
            return;
        }
        const pbNear = ComputeStationsToTrack(allPbStations, userLoc);
        const veloNear = ComputeStationsToTrack(allVeloStations, userLoc);
        const allPromises = [
            ...pbNear.map(swd => pb.station(swd.station.id)),
            ...veloNear.map(swd => velo.station(swd.station.id))
        ];
        const allNear = [...pbNear, ...veloNear];

        Status(`Fetching data for ${allPromises.length} stations…`);
        let fullNear: WithDistance<FullStation>[];
        try {
            fullNear = (await Promise.all(allPromises))
                .map((station, index) => <WithDistance<FullStation>>{
                    station,
                    distance: allNear[index].distance,
                });
        } catch (err) {
            Error(err);
            return;
        }

        // Reconcile stations based on distance heuristic.
        fullNear = ReconcileStations(
            /* pbNear */ fullNear.slice(0, pbNear.length),
            /* veloNear */ fullNear.slice(pbNear.length));

        // Clear.
        $station_list.replaceChildren();
        fullNear.map(({ station, distance }) => {
            const $row = document.createElement('tr');

            const $name = document.createElement('td');
            const $map_link = document.createElement('a');
            $map_link.textContent = station.name;
            $map_link.href = MapsUrlFromCoords(station.pos);
            $name.appendChild($map_link);
            $row.appendChild($name);

            const $distance = document.createElement('td');
            $distance.textContent = FormatDistance(distance);
            $row.appendChild($distance);

            const $bikes = document.createElement('td');
            $bikes.textContent = `${station.bikes}`;
            $row.appendChild($bikes);

            const $ebikes = document.createElement('td');
            $ebikes.textContent = `${station.ebikes.length}`;
            $row.appendChild($ebikes);

            const shown_ebikes = station.ebikes
                .slice(0, BEST_BATTERY_COUNT);

            const $battery = document.createElement('td');
            shown_ebikes.map(eb => {
                const $level = document.createElement('span');
                const classes = $level.classList;
                classes.add('battery');
                BATTERY_STYLES.forEach(([, , class_name]) => classes.remove(class_name));
                if (eb.battery == UNKNOWN_BAT || isNaN(eb.battery)) {
                    $level.textContent = '?'
                } else {
                    const [, char, class_name] = BATTERY_STYLES.filter(([min, ,]) => eb.battery >= min)[0];
                    $level.textContent = char;
                    classes.add(class_name);
                }
                return $level;
            }).forEach($e => $battery.appendChild($e));
            $row.appendChild($battery);
            $station_list.appendChild($row);

            if (shown_ebikes.length > 0) {
                const $battery_row = document.createElement('tr');
                $battery_row.classList.add("battery-row");
                const $best_ebikes = document.createElement('td');
                $best_ebikes.colSpan = 5;
                shown_ebikes
                    .forEach(ebike => {
                        const $span = document.createElement('span');
                        $span.className = "battery-lvl"

                        const $name = document.createElement('span');
                        $name.innerHTML = `${ebike.type == "publibike" ? '<sup>old</sup>' : ''}${ebike.name}`;
                        if (SHINY_BIKES.includes(parseInt(ebike.name))) {
                            $name.classList.add("text-shiny");
                        }
                        $span.appendChild($name);

                        if (ebike.battery != -1) {
                            const $bat = document.createElement('span');
                            $bat.textContent = ` (${ebike.battery}%)`;
                            $span.appendChild($bat);
                        }

                        $best_ebikes.appendChild($span);
                    });
                $battery_row.appendChild($best_ebikes);
                $station_list.appendChild($battery_row);
                $row.addEventListener('click', function (e) {
                    $battery_row.classList.toggle("visible");
                });
            }
        });
        $status.style.display = 'none';
        $station_table.style.display = 'table';
    }
    await Load();
})();

function batteryVoltage36v(voltage: number): number {
    const V_max = 42.3;     // Fully charged voltage
    const V_min = 34.0;     // Fully discharged voltage
    const b_typical = 0.03; // Steepness factor
    const c_typical = 50;   // Midpoint (50% State of Charge)
    if (voltage > V_max) { return 100; }
    if (voltage < V_min) { return 0; }
    return Math.max(0, Math.min(100, c_typical - (1 / b_typical) * Math.log((V_max - voltage) / (voltage - V_min))));
}
