// Ignore results more than 1000m away.
const DISTANCE_THRESHOLD_METERS = 1000;

// Show the N closest stations.
const STATIONS_COUNT_TO_TRACK = 10;

// Number of battery levels to display.
const BEST_BATTERY_COUNT = 3;
const BATTERY_STYLES: [number, string, string][] = [
    // Min. level, character, color.
    [90, '\u{2588}', 'darkgreen'],
    [70, '\u{2586}', 'lightgreen'],
    [50, '\u{2584}', 'orange'],
    [-Infinity, '\u{2581}', 'red'],
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

interface FullStation extends LightStation {
    name: string;
    bikes: number;
    ebikes: number;
    ebikes_battery: number[];
}

interface WithDistance<StationType> {
    station: StationType;
    distance: number;
}

function ParseLightStation(json: any): LightStation {
    return <LightStation>{
        id: json.id,
        pos: <LatLon>{lat: json.latitude, lon: json.longitude},
    };
}

function ParseFullStation(json: any): FullStation {
    const bikes = json.vehicles.filter(v => v.type.id == BikeType.Bike);
    const ebikes = json.vehicles.filter(v => v.type.id == BikeType.EBike);
    return <FullStation>{
        ...ParseLightStation(json),
        name: json.name,
        bikes: bikes.length,
        ebikes: ebikes.length,
        ebikes_battery: ebikes
            .map(ebike => ebike.ebike_battery_level || 0)
            .sort((a, b) => b - a),
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
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                position => {
                    resolve(<LatLon>{
                        lat: position.coords.latitude,
                        lon: position.coords.longitude
                    });
                },
                positionError => reject(positionError),
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

    function Status(message) {
        $status.textContent = message;
    }

    Status("Fetching stations and location…");
    const [user_loc, all_stations] = await Promise.all([
        GetUserLocation(),
        FetchStationList(),
    ]);
    const to_track = ComputeStationsToTrack(all_stations, user_loc);

    Status(`Fetching data for ${to_track.length} stations…`);
    const station_promises = to_track.map(swd => swd.station.id).map(FetchStation);
    const stations_with_distance = (await Promise.all(station_promises))
        .map((station_status, index) => <WithDistance<FullStation>>{
            station: station_status,
            distance: to_track[index].distance,
        });

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
        $ebikes.textContent = `${swd.station.ebikes}`;
        $row.appendChild($ebikes);

        const $battery = document.createElement('td');
        swd.station.ebikes_battery.slice(0, BEST_BATTERY_COUNT).map(l => {
            const $level = document.createElement('span');
            $level.classList.add('battery');
            const [_, char, color] = BATTERY_STYLES.filter(([min, _1, _2]) => l >= min)[0];
            $level.textContent = char;
            $level.style.color = color;
            return $level;
        }).forEach($e => $battery.appendChild($e));
        $row.appendChild($battery);

        $station_list.appendChild($row);
    });
    $status.style.display = 'none';
    $station_table.style.display = 'table';
})();
