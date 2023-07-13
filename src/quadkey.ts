
const CHAR_0 = '0'.charCodeAt(0);
const CHAR_1 = '1'.charCodeAt(0);
const CHAR_2 = '2'.charCodeAt(0);
const CHAR_3 = '3'.charCodeAt(0);

export const QuadKey = {
  /**
   * Convert a tile location to a quadkey
   * @param tile tile to covert
   */
  fromTile(z: number, x: number, y: number): string {
    let quadKey = '';
    for (let zI = z; zI > 0; zI--) {
      let b = CHAR_0;
      const mask = 1 << (zI - 1);
      if ((x & mask) !== 0) b++;
      if ((y & mask) !== 0) b += 2;
      quadKey += String.fromCharCode(b);
    }
    return quadKey;
  },

  toZxy(qk: string): string {
    const tile = this.toTile(qk);
    return `${tile.z}-${tile.x}-${tile.y}`
  },
  
  /**
 * Convert a quadkey to a XYZ Tile location
 * @param quadKey quadkey to convert
 */
  toTile(quadKey: string): { z: number, x: number, y: number } {
    let x = 0;
    let y = 0;
    const z = quadKey.length;

    for (let i = z; i > 0; i--) {
      const mask = 1 << (i - 1);
      const q = quadKey.charCodeAt(z - i);
      if (q === CHAR_1) x |= mask;
      if (q === CHAR_2) y |= mask;
      if (q === CHAR_3) {
        x |= mask;
        y |= mask;
      }
    }
    return { x, y, z };
  },
};