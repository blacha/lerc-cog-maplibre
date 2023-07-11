import { SourceUrl } from '@chunkd/source-url';
import { CogTiff, TiffTag } from '@cogeotiff/core';
import m from 'maplibre-gl';

// to make wasm loading easier LERC is imported via a <script />
declare const Lerc:any; // FIXME typing

// FIXME hack @cogeotiff/core as it does not have the TiffTag for LERC
(TiffTag as any)[0xc5f2] = 'Lerc'

const tiffs = new Map<string, Promise<CogTiff>>();

m.addProtocol('cog+lerc', (req, cb) => {
    if (req.type !== 'image') throw new Error('Invalid request type: ' + req.type)
    const urlParts = req.url.split('@');
    const cogPath = urlParts[0].slice('cog+lerc:'.length + 2)
    const path = urlParts[urlParts.length - 1].split('/')
    const z = Number(path[0]);
    const x = Number(path[1]);
    const y = Number(path[2]);

    const cog = tiffs.get(cogPath) ?? new CogTiff(new SourceUrl(cogPath)).init(true)
    tiffs.set(cogPath, cog);

    cog.then(async (tiff) => {
        await Lerc.load()

        const tileId = `${z}-${x}-${y}.lerc`

        // TODO would be better to actually georeference this
        // but for now just use the overviews of the tiff
        const img = tiff.images[tiff.images.length - z - 1];
        if (img == null) return cb(null, null)

        const tileCount = img.tileCount;
        if (x < 0 || x >= tileCount.x) return cb(null, null);
        if (y < 0 || y >= tileCount.y) return cb(null, null);

        const tile = await img.getTile(x, y)
        if (tile == null) return cb(null, null, 'immutable')

        // Log how big each tile is
        // console.log(tileId, tile.bytes.length)

        console.time('create:elevation:' + tileId)

        const decoded = Lerc.decode(tile.bytes.buffer)

        // Convert the DEM into a RGBA picture
        const raw = new Uint8ClampedArray(decoded.width * decoded.height * 4);
        const buf = decoded.pixels[0];

        for (let i = 0; i < buf.length; i++) {
            const px = buf[i]
            // COG's NoData is -9999, TODO extract this from the LERC metadata
            if (px === -9999 || px == 0) continue; // NO_DATA ignore
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
        console.timeEnd('create:elevation:' + tileId)

        cb(null, await createImageBitmap(new ImageData(raw, decoded.width, decoded.height)), 'immutable')
    })
    return { cancel() { } };
})

document.addEventListener('DOMContentLoaded', async () => {
    const main = document.querySelector('#main');
    if (main == null) throw new Error('Failed to find #main')

    new m.Map({
        container: 'main',
        zoom: 1,
        center: [0, 0],
        hash: true,
        style: {
            version: 8,
            sources: {
                raster: {
                    type: 'raster',
                    tiles: ['cog+lerc:///Taranaki2021/BJ29.3857.lerc.cog.tiff@{z}/{x}/{y}'],
                    tileSize: 256,
                },
                // TODO why do we need both a hillshade and terrain source
                // ref : https://maplibre.org/maplibre-gl-js/docs/examples/3d-terrain/
                hillshadeSource: {
                    type: 'raster-dem',
                    tiles: ['cog+lerc:///Taranaki2021/BJ29.3857.lerc.cog.tiff@{z}/{x}/{y}'],
                    tileSize: 256,
                    encoding: 'mapbox'
                },
                terrainSource: {
                    type: 'raster-dem',
                    tiles: ['cog+lerc:///Taranaki2021/BJ29.3857.lerc.cog.tiff@{z}/{x}/{y}'],
                    tileSize: 256,
                    encoding: 'mapbox'
                },
            },
            layers: [
                { id: 'raster', type: 'raster', source: 'raster' },
                {
                    id: 'hills',
                    type: 'hillshade',
                    source: 'terrainSource',
                    layout: { visibility: 'visible' },
                    paint: { 'hillshade-shadow-color': '#473B24' }
                }
            ],
            terrain: {
                source: 'terrainSource', exaggeration: 100
            }
        }
    })
})
