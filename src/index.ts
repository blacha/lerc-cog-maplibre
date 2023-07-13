import { SourceUrl } from '@chunkd/source-url';
import { CogTiff, TiffTag } from '@cogeotiff/core';
import m from 'maplibre-gl';
import { ColorRamp } from './ramp.js';
import { Cogs } from './cogs.js';
import { QuadKey } from './quadkey.js';
import { GoogleTms } from '@basemaps/geo/build/tms/google.js'
import { Bounds } from '@basemaps/geo';
import { CompositionTiff, Tiler } from '@basemaps/tiler';

// to make wasm loading easier LERC is imported via a <script />
declare const Lerc: any; // FIXME typing

// FIXME hack @cogeotiff/core as it does not have the TiffTag for LERC
(TiffTag as any)[0xc5f2] = 'Lerc'

const tiffs = new Map<string, Promise<CogTiff>>();

// Stolen from https://github.com/andrewharvey/srtm-stylesheets/blob/master/stylesheets/color-ramps/srtm-Australia-color-ramp.gdaldem.txt
const colorRamp = `nv 0 0 0 0
-8764 0 0 0 255
-4000 3 45 85 255
-100 0 101 199 255
0 192 224 255 255
1 108 220 108 255
55 50 180 50 255
390 240 250 150 255
835 190 185 135 255
1114 180 128 107 255
1392 235 220 175 255
2000 215 200 244 255
4000 255 0 255 255`

function createTiff(path) {
    const source = new SourceUrl(path);
    source.chunkSize = 64 * 1000;
    return new CogTiff(source).init(true)
}

const emptyBuffer = (type) => {
    const raw = new Uint8ClampedArray(256 * 256 * 4)
    if (type === 'mapbox') {
        for (let i = 0; i < 256 * 256; i++) {
            const offset = i * 4;
            raw[offset + 3] = 255

            /** mapbox */
            const base = -10_000;
            const interval = 0.1;

            const v = (0 - base) / interval
            raw[offset + 0] = Math.floor(v / 256 / 256) % 256
            raw[offset + 1] = Math.floor(v / 256) % 256
            raw[offset + 2] = v % 256
        }
        return createImageBitmap(new ImageData(raw, 256, 256));;
    }

    return createImageBitmap(new ImageData(raw, 256, 256));
}
const googleTiler = new Tiler(GoogleTms);


const cancel = { cancel() { } };

const ramp = new ColorRamp(colorRamp, -9999)

m.addProtocol('cog+lerc', (req, cb) => {
    if (req.type !== 'image') throw new Error('Invalid request type: ' + req.type)
    const urlParts = req.url.split('@');
    const cogParts = urlParts[0].split('#');
    const cogName = cogParts[0].slice('cog+lerc:'.length + 2)
    let method = 'mapbox'
    if (cogParts[1]) method = cogParts[1]

    const path = urlParts[urlParts.length - 1].split('/')
    const z = Number(path[0]);
    const x = Number(path[1]);
    const y = Number(path[2]);

    const cogs = Cogs[cogName]
    if (cogs == null) {
        cb(new Error('Invalid cog name: ' + cogName));
        return cancel;
    }

    const targetTile = QuadKey.fromTile(z, x, y);

    for (const cogQk of cogs) {
        if (!targetTile.startsWith(cogQk)) continue;

        const cog = tiffs.get(cogQk) ?? createTiff(`${cogName}/${QuadKey.toZxy(cogQk)}.tiff`)
        tiffs.set(cogQk, cog);

        cog.then(async (tiff) => {
            await Lerc.load()


            const tileId = `${z}-${x}-${y}.lerc`
            const result = await googleTiler.tile([tiff], x, y, z)

            if (result.length !== 1) {
                console.log('non1 result', tileId);
                cb(null, await emptyBuffer(method))
                return cancel;
            }
            const comp = result[0] as CompositionTiff;

            const tile = await tiff.images[comp.source.imageId].getTile(comp.source.x, comp.source.y);
            if (tile == null) {
                console.log('empty tile', tileId)
                cb(null, await emptyBuffer(method))
                return cancel
            }

            console.time('create:elevation:' + method + ':' + tileId)

            const decoded = Lerc.decode(tile.bytes.buffer)
            // Convert the DEM into a RGBA picture
            const raw = new Uint8ClampedArray(decoded.width * decoded.height * 4);
            const buf = decoded.pixels[0];

            for (let i = 0; i < buf.length; i++) {
                let px = buf[i]

                if (method === 'ramp') {
                    const offset = i * 4;

                    const color = ramp.get(px);
                    raw[offset + 0] = color[0]
                    raw[offset + 1] = color[1]
                    raw[offset + 2] = color[2]
                    raw[offset + 3] = color[3]
                    continue;
                }

                // COG's NoData is -9999, TODO extract this from the LERC metadata
                if (px === -9999 || px == 0) px = 0; // NO_DATA ignore
                const offset = i * 4;
                // Set alpha to full!
                raw[offset + 3] = 255

                /** mapbox */
                const base = -10_000;
                const interval = 0.1;

                const v = (px - base) / interval
                raw[offset + 0] = Math.floor(v / 256 / 256) % 256
                raw[offset + 1] = Math.floor(v / 256) % 256
                raw[offset + 2] = v % 256

                /** terrarium */
                // const v = px + 32768;
                // raw[offset] = (Math.floor(v / 256));
                // raw[offset + 1] = (Math.floor(v % 256));
                // raw[offset + 2] = (Math.floor((v - Math.floor(v)) * 256));
            }

            console.timeEnd('create:elevation:' + method + ':' + tileId)
            cb(null, await createImageBitmap(new ImageData(raw, decoded.width, decoded.height)), 'immutable')
            return cancel;
        })
        return cancel
    }

    emptyBuffer(method).then((buf) => cb(null, buf))
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
