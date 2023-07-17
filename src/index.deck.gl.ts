import { Deck } from '@deck.gl/core/typed';
import { MapView } from '@deck.gl/core';
import { TerrainLayer, TileLayer } from '@deck.gl/geo-layers/typed';
import { BitmapLayer, PathLayer } from '@deck.gl/layers';
import { GeoJsonLayer, ArcLayer } from '@deck.gl/layers';
import * as terrain from '@loaders.gl/terrain'
import { GoogleTms } from '@basemaps/geo';
import { Tiler } from '@basemaps/tiler';
import { lercToBuffer, lercToImage } from './cogs.js';
import Martini from '@mapbox/martini'
import Delatin from './delatin.js'
export type TypedArray =
  | Int8Array
  | Uint8Array
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Uint8ClampedArray
  | Float32Array
  | Float64Array;
const martini = new Martini(257)
type BoundingBox = [[number, number, number], [number, number, number]];
export type MeshAttribute = {
    value: TypedArray;
    size: number;
    byteOffset?: number;
    byteStride?: number;
    normalized?: boolean;
  }
  export type MeshAttributes = Record<string, MeshAttribute>;

  ;
/**
 * Get the (axis aligned) bounding box of a mesh
 * @param attributes
 * @returns array of two vectors representing the axis aligned bounding box
 */
// eslint-disable-next-line complexity
export function getMeshBoundingBox(attributes: MeshAttributes): BoundingBox {
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
  
    const positions = attributes.POSITION ? attributes.POSITION.value : [];
    const len = positions && positions.length;
  
    for (let i = 0; i < len; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
  
      minX = x < minX ? x : minX;
      minY = y < minY ? y : minY;
      minZ = z < minZ ? z : minZ;
  
      maxX = x > maxX ? x : maxX;
      maxY = y > maxY ? y : maxY;
      maxZ = z > maxZ ? z : maxZ;
    }
    return [
      [minX, minY, minZ],
      [maxX, maxY, maxZ]
    ];
  }
  
const COUNTRIES =
    'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_50m_admin_0_scale_rank.geojson'; //eslint-disable-line

    const googleTiler = new Tiler(GoogleTms);

    function getMeshAttributes(
        vertices,
        terrain: Float32Array ,
        width: number,
        height: number,
        bounds?: number[]
      ) {
        const gridSize = width ;
        const numOfVerticies = vertices.length / 2;
        // vec3. x, y in pixels, z in meters
        const positions = new Float32Array(numOfVerticies * 3);
        // vec2. 1 to 1 relationship with position. represents the uv on the texture image. 0,0 to 1,1.
        const texCoords = new Float32Array(numOfVerticies * 2);
      
        const [minX, minY, maxX, maxY] = bounds || [0, 0, width, height];
        const xScale = (maxX - minX) / width;
        const yScale = (maxY - minY) / height;
      
        for (let i = 0; i < numOfVerticies; i++) {
          const x = vertices[i * 2];
          const y = vertices[i * 2 + 1];
          const pixelIdx = y * gridSize + x;
      
          positions[3 * i + 0] = x * xScale + minX;
          positions[3 * i + 1] = -y * yScale + maxY;
          positions[3 * i + 2] = terrain[pixelIdx];
      
          texCoords[2 * i + 0] = x / width;
          texCoords[2 * i + 1] = y / height;
        }
      
        return {
          POSITION: {value: positions, size: 3},
          TEXCOORD_0: {value: texCoords, size: 2},
        //   NORMAL: {},// - optional, but creates the high poly look with lighting
        };
      }
      

      const tileLayer = new TileLayer({
        // https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames#Tile_servers
        data: 'https://Taranaki2021#ramp@{z}/{x}/{y}',
    
        minZoom: 0,
        maxZoom: 22,
        tileSize: 256,

        async getTileData(props) {
            // console.log(props)

            return await lercToImage(props.url?.replace('https', 'cog+lerc'))
            // const ret = await fetch(props.url!)
            // if (ret.ok) return ret.arrayBuffer();
            // return null;
        },
    
        renderSubLayers: props => {
            // console.log(props)
          const {
            bbox: {west, south, east, north}
          } = props.tile;
    
          return new BitmapLayer(props, {
            data: null,
            image: props.data,
            bounds: [west, south, east, north]
          });
        }
      });

export function renderToDom() {
    const app = document.querySelector('#app');
    const layer = new TerrainLayer({
        id: 'terrain',

        // getTileData(props) {
        //     console.log('getTile', props)
        // },

        async fetch(url, context) {
            if (url.startsWith('https')) return fetch(url);

              const buf = await lercToBuffer(url);
              if (buf == null) {
                console.log('Nothing');
                throw Error('Missing')
              }
              const width = buf.width;
              const height = buf.height;

            //   const tin = new Delatin(buf.buffer, width + 1, height+ 1);
            //   tin.run(10);
            //   // @ts-expect-error
            //   const {coords, triangles} = tin;
            //   const vertices = coords;
              const terrain = new Float32Array((buf.width + 1) * (buf.height  + 1));
              for (let i = 0, y = 0; y < height; y++) {
                for (let x = 0; x < width; x++, i++) {
                    // const val = buf.buffer[i];
                    terrain[i + y] = buf.buffer[i];

                }
            }
              for (let i = (buf.width + 1) * buf.width, x = 0; x < buf.width; x++, i++) {
                terrain[i] = terrain[i - buf.width - 1];
              }
              // backfill right border
              for (let i = buf.height, y = 0; y < buf.height + 1; y++, i += buf.height + 1) {
                terrain[i] = terrain[i - 1];
              }

              const tile = martini.createTile(terrain);
              const {vertices, triangles} = tile.getMesh();
 
              let attributes = getMeshAttributes(vertices, buf.buffer, width, height);
              const boundingBox = getMeshBoundingBox(attributes);
              console.log(url, width, height)

            //   console.log(url, buf.buffer, attributes)
              return {
                // Data return by this loader implementation
                loaderData: {
                  header: {}
                },
                header: {
                  vertexCount: triangles.length,
                  boundingBox
                },
                mode: 4, // TRIANGLES
                indices: {value: Uint32Array.from(triangles), size: 1},
                attributes
              };
        },
        minZoom: 0,
        maxZoom: 23,
        strategy: 'no-overlap',
        elevationDecoder: {
            rScaler: 6553.6,
            gScaler: 25.6,
            bScaler: 0.1,
            offset: -10000
          },
        elevationData: 'cog+lerc://Taranaki2021#@{z}/{x}/{y}',
        texture: 'https://basemaps.linz.govt.nz/v1/tiles/aerial/WebMercatorQuad/{z}/{x}/{y}.webp?api=c01h3e17kjsw5evq8ndjxbda80e',
        wireframe : false,
        color: [255, 255, 255]
      });

    const deck = new Deck({
        canvas: 'deck-canvas',
        initialViewState: {
            latitude: -39.333,
            longitude: 174.0416,
            zoom: 11
        },
        controller: true,
        layers: [
            layer,
            // tileLayer,
            new GeoJsonLayer({
                id: 'base-map',
                data: COUNTRIES,
                // Styles
                stroked: true,
                filled: true,
                lineWidthMinPixels: 2,
                opacity: 0.4,
                getLineColor: [60, 60, 60],
                getFillColor: [200, 200, 200]
            }),
        ]
    })
    console.log(deck)
}

document.addEventListener('DOMContentLoaded', renderToDom);