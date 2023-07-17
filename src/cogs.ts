import { SourceUrl } from "@chunkd/source-url";
import { QuadKey } from "./quadkey.js";
import { CogTiff, TiffTag } from "@cogeotiff/core";
import { CompositionTiff, Tiler } from "@basemaps/tiler";
import { ramp } from "./ramp.js";
import { GoogleTms } from "@basemaps/geo";
import { decode } from "lerc";

export const Cogs = {
    'Taranaki2021': [
        [11, 2012, 1267],
        [11, 2013, 1266],
        [11, 2013, 1267],
        [11, 2013, 1268],
        [11, 2014, 1265],
        [11, 2014, 1266],
        [11, 2014, 1267],
        [11, 2014, 1268],
        [11, 2014, 1269],
        [11, 2015, 1265],
        [11, 2015, 1266],
        [11, 2015, 1267],
        [11, 2015, 1268],
        [11, 2015, 1269],
        [11, 2016, 1264],
        [11, 2016, 1265],
        [11, 2016, 1266],
        [11, 2016, 1267],
        [11, 2016, 1268],
        [11, 2016, 1269],
        [11, 2016, 1270],
        [11, 2017, 1263],
        [11, 2017, 1264],
        [11, 2017, 1265],
        [11, 2017, 1266],
        [11, 2017, 1267],
        [11, 2017, 1268],
        [11, 2017, 1269],
        [11, 2017, 1270],
        [11, 2017, 1271],
        [11, 2018, 1263],
        [11, 2018, 1264],
        [11, 2018, 1265],
        [11, 2018, 1266],
        [11, 2018, 1267],
        [11, 2018, 1268],
        [11, 2018, 1269],
        [11, 2018, 1270],
        [11, 2018, 1271],
        [11, 2019, 1265],
        [11, 2019, 1266],
        [11, 2019, 1269],
        [12, 4025, 2533],
        [12, 4025, 2536],
        [12, 4027, 2538],
        [12, 4038, 2537],
        [12, 4038, 2540],
        [13, 8051, 5065],
        [13, 8051, 5074],
        [13, 8053, 5076],
        [13, 8054, 5063],
        [13, 8055, 5062],
        [13, 8055, 5063],
        [13, 8062, 5080],
        [13, 8063, 5080],
        [13, 8063, 5081],
        [13, 8066, 5084],
        [13, 8067, 5084],
        [13, 8067, 5085],
        [13, 8076, 5068],
        [13, 8076, 5082],
        [13, 8076, 5083],
        [13, 8078, 5080],
    ].map(f => QuadKey.fromTile(f[0], f[1], f[2]))
}

function createTiff(path) {
    const source = new SourceUrl(path);
    source.chunkSize = 64 * 1000;
    return new CogTiff(source).init(true)
}

const tiffs = new Map<string, Promise<CogTiff>>();

// FIXME hack @cogeotiff/core as it does not have the TiffTag for LERC
(TiffTag as any)[0xc5f2] = 'Lerc'
declare const Lerc: any; // FIXME typing

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

export async function lercToBuffer(url: string): Promise<{ buffer: Float32Array, width: number, height: number } | null> {
    const urlParts = url.split('@');
    const cogParts = urlParts[0].split('#');
    const cogName = cogParts[0].slice('cog+lerc:'.length + 2)
    let method = 'mapbox'
    if (cogParts[1]) method = cogParts[1]

    const path = urlParts[urlParts.length - 1].split('/')
    const z = Number(path[0]);
    const x = Number(path[1]);
    const y = Number(path[2]);

    const cogs = Cogs[cogName]
    if (cogs == null) return null;
    const targetTile = QuadKey.fromTile(z, x, y);

    for (const cogQk of cogs) {
        if (!targetTile.startsWith(cogQk)) continue;

        const cog = tiffs.get(cogQk) ?? createTiff(`${cogName}/${QuadKey.toZxy(cogQk)}.tiff`)
        tiffs.set(cogQk, cog);

        return cog.then(async (tiff) => {
            await Lerc.load()


            const tileId = `${z}-${x}-${y}.lerc`
            const result = await googleTiler.tile([tiff], x, y, z)

            if (result.length !== 1) {
                console.log('non1 result', tileId);
                return null
            }
            const comp = result[0] as CompositionTiff;

            const tile = await tiff.images[comp.source.imageId].getTile(comp.source.x, comp.source.y);
            if (tile == null) {
                console.log('empty tile', tileId)
                return null
            }

            console.time('create:elevation:' + method + ':' + tileId)

            const decoded = Lerc.decode(tile.bytes.buffer)

            return { buffer: decoded.pixels[0], width: decoded.width, height: decoded.height }
        })
    }
    return null;
}

export async function lercToImage(url: string): Promise<ImageBitmap | null> {
    const urlParts = url.split('@');
    const cogParts = urlParts[0].split('#');
    const cogName = cogParts[0].slice('cog+lerc:'.length + 2)
    let method = 'mapbox'
    if (cogParts[1]) method = cogParts[1]

    const path = urlParts[urlParts.length - 1].split('/')
    const z = Number(path[0]);
    const x = Number(path[1]);
    const y = Number(path[2]);

    const cogs = Cogs[cogName]
    if (cogs == null) return null;

    const tileId = `${z}-${x}-${y}.lerc`

    const ret = await lercToBuffer(url);
    if (ret == null) return emptyBuffer(method);
    console.time('create:elevation:' + method + ':' + tileId)

    // Convert the DEM into a RGBA picture
    const raw = new Uint8ClampedArray(ret.width * ret.height * 4);
    const buf = ret.buffer;

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
    return await createImageBitmap(new ImageData(raw, ret.width, ret.height));
}