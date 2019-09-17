const s3Base = "https://www.harp.gl/docs/";

//Update initial links to s3 base
document.querySelector(".examples-link").href = s3Base + "master/examples/";
document.querySelector(".docs-link").href = s3Base + "master/doc/";
document.getElementById("docs-nav").href = s3Base + "master/doc/";
document.getElementById("examples-nav").href = s3Base + "master/examples/";
document.getElementById("docs-nav-mobile").href = s3Base + "master/doc/";

const releases = [
    {
        date: "latest",
        hash: "master"
    }
];
const dropdown = document.querySelector("select[name=versions]");

fetch("https://www.harp.gl/releases.json")
    .then(res => res.json())
    .then(res => {
        releases.push(...res);
        releases.forEach(release => {
            const option = document.createElement("option");
            option.innerText = release.date;
            dropdown.appendChild(option);
        });

        dropdown.onchange = () => {
            const selected = dropdown.querySelector("option:checked");
            const hash = releases.filter(x => x.date === selected.innerText)[0].hash;
            const date = releases.filter(x => x.date === selected.innerText)[0].date;

            //Update examples button and link
            document.querySelector(".examples-link").href = s3Base + hash + "/examples/";
            document.querySelector(".examples-link").innerText =
                "Examples" + (date !== "master" ? ` (${date})` : "");

            //Update docs button and link
            document.querySelector(".docs-link").href = s3Base + hash + "/doc/";
            document.querySelector(".docs-link").innerText =
                "Documentation" + (date !== "master" ? ` (${date})` : "");
        };
    })
    .catch(() => {
        //In case network request to build information fails, add master link
        const option = document.createElement("option");
        option.innerText = "master";
        dropdown.appendChild(option);
    });

setTimeout(() => {
    document.querySelector("header").style.backgroundImage = `url('resources/background.png')`;
}, 1000);

//Map information

const canvas = document.getElementById("map");
const map = new harp.MapView({
    canvas,
    theme: "resources/theme.json",
    maxVisibleDataSourceTiles: 40,
    tileCacheSize: 100
});

map.resize(window.innerWidth, window.innerHeight);
window.onresize = () => map.resize(window.innerWidth, window.innerHeight);

const omvDataSource = new harp.OmvDataSource({
    baseUrl: "https://xyz.api.here.com/tiles/herebase.02",
    apiFormat: harp.APIFormat.XYZOMV,
    styleSetName: "tilezen",
    authenticationCode: token
});
map.addDataSource(omvDataSource);

const options = { tilt: 45, distance: 1500 };
const NY = new harp.GeoCoordinates(42.361145, -71.057083);
let azimuth = 300;
map.addEventListener(harp.MapViewEventNames.Render, () =>
    map.lookAt(NY, options.distance, options.tilt, (azimuth += 0.1))
);
window.addEventListener("resize", () => map.resize(window.innerWidth, window.innerHeight));
map.beginAnimation();

//Update year
document.getElementById('year').innerText = new Date().getFullYear()
