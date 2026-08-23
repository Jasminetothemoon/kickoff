#!/usr/bin/env node
/**
 * 生成托盘图标(纯 Node,零依赖):
 *   - assets/icon.png      32x32(视网膜屏 / 默认图标)
 *   - assets/icon-16.png   16x16(菜单栏基准尺寸)
 * 图形:靛蓝 #4F46E5 圆点 + 白色播放三角。
 * 用 4x 超采样做抗锯齿;PNG 由 Node 内置 zlib 手工编码(IHDR/IDAT/IEND + CRC32)。
 * 运行:node assets/make-icon.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname);

// ---------- PNG 编码 ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  // 每条扫描线前置 filter byte 0
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 图形:圆 + 三角(带符号距离,超采样) ----------
const INDIGO = [0x4f, 0x46, 0xe5]; // #4F46E5
const WHITE = [0xff, 0xff, 0xff];

/** 点是否在三角形内(重心坐标法,含边界) */
function inTri(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/** 在 size x size 的画布上光栅化(S = 每像素采样数,SS = 超采样倍率) */
function render(size, SS = 4) {
  const rgba = Buffer.alloc(size * size * 4);
  // 逻辑坐标系:与输出同尺寸,内部用 SS 倍超采样
  const cx = size / 2, cy = size / 2, r = size / 2 - 1; // 圆留 1px 边距
  // 白色播放三角(圆心略右偏,视觉居中):按 16px 比例缩放
  const k = size / 16;
  const tri = [
    [cx - 1.6 * k, cy - 2.7 * k],
    [cx - 1.6 * k, cy + 2.7 * k],
    [cx + 3.0 * k, cy],
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let circleHits = 0, triHits = 0, total = SS * SS;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          if ((px - cx) ** 2 + (py - cy) ** 2 <= r * r) {
            circleHits++;
            if (inTri(px, py, tri[0][0], tri[0][1], tri[1][0], tri[1][1], tri[2][0], tri[2][1])) triHits++;
          }
        }
      }
      const i = (y * size + x) * 4;
      if (circleHits === 0) {
        rgba[i + 3] = 0; // 透明
        continue;
      }
      const triCov = triHits / total;
      const circleCov = circleHits / total;
      // 混合:靛蓝圆为底,白色三角按覆盖率叠加
      const col = [0, 1, 2].map((c) => Math.round(INDIGO[c] * (1 - triCov) + WHITE[c] * triCov));
      rgba[i] = col[0];
      rgba[i + 1] = col[1];
      rgba[i + 2] = col[2];
      rgba[i + 3] = Math.round(255 * Math.min(1, circleCov + 0.35)); // 边缘柔化
    }
  }
  return encodePNG(size, size, rgba);
}

const icon32 = render(32, 4);
const icon16 = render(16, 4);
fs.writeFileSync(path.join(OUT_DIR, 'icon.png'), icon32);
fs.writeFileSync(path.join(OUT_DIR, 'icon-16.png'), icon16);
console.log(`icon.png (32x32, ${icon32.length}B), icon-16.png (16x16, ${icon16.length}B) 已生成`);
console.log('icon-16 base64(data URL,可嵌入 main.js 作为 fallback):');
console.log('data:image/png;base64,' + icon16.toString('base64'));
