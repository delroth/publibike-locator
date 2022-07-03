// Ignore results more than 1000m away.
const DISTANCE_THRESHOLD_METERS = 1000;

// Show the N closest stations.
const STATIONS_COUNT_TO_TRACK = 10;

// Number of battery levels to display.
const BEST_BATTERY_COUNT = 3;
const BATTERY_STYLES: [number, string, string][] = [
    // Min. level, character, class name (for color).
    [90, '\u{2588}', 'bat-nice'],
    [60, '\u{2586}', 'bat-meh'],
    [30, '\u{2584}', 'bat-ugh'],
    [-Infinity, '\u{2581}', 'bat-zero'],
];

// API base.
const STATION_LIST_URL = "https://publibike-api.delroth.net/v1/public/stations";

enum BikeType { Bike = 1, EBike = 2 }

interface LatLon {
    lat: number;
    lon: number;
}

interface LightStation {
    id: string;
    pos: LatLon;
}

interface EBike {
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

function ParseLightStation(json: any): LightStation {
    return <LightStation>{
        id: json.id,
        pos: <LatLon>{ lat: json.latitude, lon: json.longitude },
    };
}

function ParseFullStation(json: any): FullStation {
    const bikes = json.vehicles.filter(v => v.type.id == BikeType.Bike);
    const ebikes = json.vehicles.filter(v => v.type.id == BikeType.EBike)
        .map(v => <EBike>{
            name: v.name,
            battery: v.ebike_battery_level || -1,
        })
        .sort((a, b) => b.battery - a.battery);
    return <FullStation>{
        ...ParseLightStation(json),
        name: json.name,
        bikes: bikes.length,
        ebikes: ebikes,
    };
}

async function FetchStationList(): Promise<LightStation[]> {
    const response = await fetch(STATION_LIST_URL);
    const json = await response.json();
    return json.map(ParseLightStation);
}

async function FetchStation(id: string): Promise<FullStation> {
    const response = await fetch(`${STATION_LIST_URL}/${id}`);
    const json = await response.json();
    return ParseFullStation(json);
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
function ComputeStationsToTrack(stations: LightStation[], user_loc: LatLon) {
    return stations.map(
        station => <WithDistance<LightStation>>{
            station: station,
            distance: CoordsDistance(user_loc, station.pos),
        })
        .sort((s1, s2) => s1.distance - s2.distance)
        .filter(swd => swd.distance <= DISTANCE_THRESHOLD_METERS)
        .slice(0, STATIONS_COUNT_TO_TRACK);
}

// Get location from browser navigator API.
function GetUserLocation() {
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
        Status("Fetching stations and location…");
        let user_loc, all_stations;
        try {
            [user_loc, all_stations] = await Promise.all([
                GetUserLocation(),
                FetchStationList(),
            ]);
        } catch (err) {
            Error(err);
            return;
        }
        const to_track = ComputeStationsToTrack(all_stations, user_loc);

        Status(`Fetching data for ${to_track.length} stations…`);
        const station_promises = to_track.map(swd => swd.station.id).map(FetchStation);
        let stations_with_distance;
        try {
            stations_with_distance = (await Promise.all(station_promises))
                .map((station_status, index) => <WithDistance<FullStation>>{
                    station: station_status,
                    distance: to_track[index].distance,
                });
        } catch (err) {
            Error(err);
            return;
        }

        stations_with_distance.map(swd => {
            const $row = document.createElement('tr');

            const $name = document.createElement('td');
            const $map_link = document.createElement('a');
            $map_link.textContent = swd.station.name;
            $map_link.href = MapsUrlFromCoords(swd.station.pos);
            $name.appendChild($map_link);
            $row.appendChild($name);

            const $distance = document.createElement('td');
            $distance.textContent = FormatDistance(swd.distance);
            $row.appendChild($distance);

            const $bikes = document.createElement('td');
            $bikes.textContent = `${swd.station.bikes}`;
            $row.appendChild($bikes);

            const $ebikes = document.createElement('td');
            $ebikes.textContent = `${swd.station.ebikes.length}`;
            $row.appendChild($ebikes);

            const shown_ebikes = swd.station.ebikes
                .filter(eb => eb.battery >= 0).slice(0, BEST_BATTERY_COUNT);

            const $battery = document.createElement('td');
            shown_ebikes.map(eb => {
                const $level = document.createElement('span');
                const classes = $level.classList;
                classes.add('battery');
                BATTERY_STYLES.forEach(([, , class_name]) => classes.remove(class_name));
                const [, char, class_name] = BATTERY_STYLES.filter(([min, ,]) => eb.battery >= min)[0];
                $level.textContent = char;
                classes.add(class_name);
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
                    .map(eb => `${eb.name} (${eb.battery}%)`)
                    .forEach(text => {
                        const $span = document.createElement('span');
                        $span.textContent = text;
                        $span.className = "battery-lvl";
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
