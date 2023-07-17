import m from 'maplibre-gl';
import { lercToImage } from './cogs.js';




const cancel = { cancel() { } };


m.addProtocol('cog+lerc', (req, cb) => {
    if (req.type !== 'image') throw new Error('Invalid request type: ' + req.type)

    lercToImage(req.url).then(buf => {
        if (buf) return cb(null, buf);
        return cb(new Error('Failed'), null);
    })
    return cancel
})

document.addEventListener('DOMContentLoaded', async () => {
    const main = document.querySelector('#main');
    if (main == null) throw new Error('Failed to find #main')

    const style = {
        version: 8,
        sources: {
            linz: {
                type: 'raster',
                tiles: ['https://basemaps.linz.govt.nz/v1/tiles/aerial/WebMercatorQuad/{z}/{x}/{y}.webp?api=c01h3e17kjsw5evq8ndjxbda80e'],
                tileSize: 256,
            },
            raster: {
                type: 'raster',
                tiles: ['cog+lerc://Taranaki2021#ramp@{z}/{x}/{y}'],
                tileSize: 256,
                minzoom: 10,
                maxzoom: 18,
            },
            // TODO why do we need both a hillshade and terrain source
            // ref : https://maplibre.org/maplibre-gl-js/docs/examples/3d-terrain/
            hillshadeSource: {
                type: 'raster-dem',
                tiles: ['cog+lerc://Taranaki2021#mapbox@{z}/{x}/{y}'],
                tileSize: 256,
                encoding: 'mapbox'
            },
            terrainSource: {
                type: 'raster-dem',
                tiles: ['cog+lerc://Taranaki2021#mapbox@{z}/{x}/{y}'],
                tileSize: 256,
                encoding: 'mapbox'
            },
        },
        layers: [
            { id: 'linz', type: 'raster', source: 'linz' },
        ],
        terrain: {
            source: 'terrainSource', exaggeration: 1
        }
    } as any


    const map = new m.Map({
        container: 'main',
        zoom: 10,
        center: [174.0416, -39.333],
        hash: true,
        style,
    });

    map.addControl(
        new m.NavigationControl({
            visualizePitch: true,
            showZoom: true,
            showCompass: true
        })
    );

    map.addControl(
        new m.TerrainControl({
            source: 'terrainSource',
            exaggeration: 1
        })
    );


    document.querySelector('#color-ramp')?.addEventListener('click', () => {
        const ramp = map.getLayer('ramp')
        if (ramp) {
            map.removeLayer('ramp')
        } else {
            map.addLayer({ id: 'ramp', type: 'raster', source: 'raster' }, map.getLayer('hillshade') ? 'hillshade' : undefined)
        }
    })

    document.querySelector('#hillshade')?.addEventListener('click', () => {
        const shade = map.getLayer('hillshade')
        if (shade) {
            map.removeLayer('hillshade')
        } else {
            map.addLayer({
                id: 'hillshade',
                type: 'hillshade',
                source: 'hillshadeSource',
                layout: { visibility: 'visible' },
                paint: {
                    'hillshade-shadow-color': '#473B24'
                }
            })
        }
    })
    // map.showTileBoundaries = true
    window['map'] = map;
})
