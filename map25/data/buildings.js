// 시설 건물 그림 — 항공영상(Desktop/시설 항공영상)과 시설 사진(리플렛 사진)의 실제 외관을 보고 그렸다.
// 각 그림은 bottom-center가 시설 좌표에 닿는다. widthM은 실제 폭(m)이라 줌에 따라 같은 비율로 커진다.
// 외부 테마파크의 그림·자산은 쓰지 않았다. 모두 이 파일에서 직접 그린 도형이다.
(function (root) {
  'use strict';

  // 지도 전체와 맞춘 파스텔 팔레트
  const C = {
    ink: '#6b5847',          // 윤곽선
    shade: 'rgba(90,74,58,.16)',
    glass: '#8ed6d9', glassDark: '#5fb6bd', glassLight: '#bdeaea',
    cream: '#f2e6d2', creamDark: '#dcc9ac', creamLight: '#fbf4e6',
    slate: '#6e7a84', slateDark: '#515d67', slateLight: '#94a2ac',
    tile: '#5d6670', tileDark: '#464e57', tileLight: '#808c97',   // 기와
    thatch: '#e3c67e', thatchDark: '#c7a85e',                      // 초가
    wood: '#b98a5c', woodDark: '#8e6540',
    stone: '#cfc6b4', stoneDark: '#aba08c',
    mint: '#bcd9a8', mintDark: '#97bb80',
    water: '#8fd8ea', waterDark: '#63bcd4',
    grass: '#a9d48a', grassDark: '#86b968',
    red: '#e2705f', yellow: '#f2c75c', orange: '#ef9f55',
    blue: '#7aa8dd', purple: '#a98fc8', white: '#fdfbf5'
  };

  const esc = s => s.replace(/#/g, '%23');
  // 땅에 닿는 그림자. 그림마다 같은 자리에 둬서 지도 위에 떠 보이지 않게 한다.
  const shadow = (cx, cy, rx, ry = rx * 0.3) =>
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${C.shade}"/>`;
  const stroke = (w = 2.2) => `stroke="${C.ink}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

  // 맞배지붕 한 채 — 한옥·사택에 공통으로 쓴다.
  function gable(x, y, w, h, roofH, roof, roofDark, wall, wallDark, eave = 7) {
    const cx = x + w / 2;
    return `
      <g ${stroke(1.8)}>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${wall}"/>
        <rect x="${x}" y="${y}" width="${w * 0.42}" height="${h}" fill="${wallDark}" stroke="none" opacity=".45"/>
        <path d="M${x - eave} ${y + 3} L${cx} ${y - roofH} L${x + w + eave} ${y + 3} Z" fill="${roof}"/>
        <path d="M${cx} ${y - roofH} L${x + w + eave} ${y + 3} L${cx} ${y + 3} Z" fill="${roofDark}" stroke="none" opacity=".5"/>
      </g>`;
  }

  // 한옥 기와지붕 — 처마 끝이 살짝 올라간다.
  function hanok(x, y, w, h, roofH, wall = C.cream) {
    const cx = x + w / 2, e = w * 0.16;
    return `
      <g ${stroke(1.8)}>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${wall}"/>
        <path d="M${x + w * 0.2} ${y} v${h} M${x + w * 0.5} ${y} v${h} M${x + w * 0.8} ${y} v${h}"
              stroke="${C.woodDark}" stroke-width="1.4" opacity=".55"/>
        <path d="M${x - e} ${y + 4} q${e * 0.6} ${-6} ${e * 1.1} ${-7} L${cx} ${y - roofH}
                 L${x + w + e - e * 1.1} ${y - 3} q${e * 0.5} ${1} ${e * 1.1} ${7} Z" fill="${C.tile}"/>
        <path d="M${cx} ${y - roofH} L${x + w + e} ${y + 4} L${cx} ${y + 2} Z" fill="${C.tileDark}" stroke="none" opacity=".45"/>
        <path d="M${x - e} ${y + 4} L${x + w + e} ${y + 4}" stroke="${C.tileLight}" stroke-width="2.4" opacity=".7"/>
      </g>`;
  }

  // 초가지붕 한 채 — 둥글게 덮인 두툼한 이엉.
  function straw(x, y, w, h, roofH) {
    const cx = x + w / 2, e = w * 0.12, L = x - e, R = x + w + e;
    return `
      <g ${stroke(1.8)}>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.cream}"/>
        <path d="M${L} ${y + 4} C${x + w * 0.1} ${y - roofH} ${x + w * 0.9} ${y - roofH} ${R} ${y + 4} Z"
              fill="${C.thatch}"/>
        <path d="M${cx} ${y - roofH * 0.72} C${x + w * 0.9} ${y - roofH * 0.62} ${R - 4} ${y - 2} ${R} ${y + 4}
                 L${cx} ${y + 4} Z" fill="${C.thatchDark}" stroke="none" opacity=".45"/>
      </g>
      <path d="M${L + 3} ${y + 2} C${x + w * 0.2} ${y - roofH * 0.62} ${x + w * 0.8} ${y - roofH * 0.62} ${R - 3} ${y + 2}"
            fill="none" stroke="${C.thatchDark}" stroke-width="1.4" opacity=".6"/>`;
  }

  // ---------------------------------------------------------------- 시설별 그림
  const ART = {};

  // 문경석탄박물관 — 타원 드럼. 크림색 격자 외벽, 흰 챙지붕, 기둥 현관, 계단.
  ART.museum = () => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 200">
      ${shadow(130, 188, 98, 11)}
      <g ${stroke(2.4)}>
        <path d="M34 64 v62 a96 26 0 0 0 192 0 V64 Z" fill="${C.cream}"/>
      </g>
      <g opacity=".95">
        ${Array.from({ length: 13 }, (_, i) => {
          const t = (i + 0.5) / 13, x = 36 + t * 188;
          const d = Math.abs(t - 0.5) * 2, hh = 50 - d * 14, yy = 72 + d * 13;
          return `<rect x="${x - 5.4}" y="${yy}" width="10.8" height="${hh}" rx="2"
                   fill="${i % 2 ? C.creamDark : C.white}" stroke="${C.creamDark}" stroke-width=".9"/>`;
        }).join('')}
      </g>
      <path d="M34 126 a96 26 0 0 0 192 0" fill="none" ${stroke(2.4)}/>
      <g ${stroke(2.4)}>
        <ellipse cx="130" cy="64" rx="96" ry="25" fill="${C.creamDark}"/>
        <path d="M22 54 a108 28 0 0 0 216 0 v-6 a108 28 0 0 0 -216 0 Z" fill="${C.white}"/>
        <ellipse cx="130" cy="48" rx="108" ry="28" fill="${C.creamLight}"/>
        <ellipse cx="130" cy="48" rx="86" ry="21" fill="none" stroke="${C.creamDark}" stroke-width="1.6"/>
      </g>
      <g ${stroke(2)}>
        <rect x="96" y="112" width="68" height="46" rx="3" fill="${C.glassDark}"/>
        <rect x="104" y="118" width="52" height="34" rx="2" fill="${C.glass}" stroke="none"/>
        <path d="M130 118 v34 M104 135 h52" stroke="${C.white}" stroke-width="2" opacity=".8"/>
        <path d="M86 158 h88 l10 12 H76 Z" fill="${C.stone}"/>
        <path d="M80 164 h100" stroke="${C.stoneDark}" stroke-width="2" opacity=".8"/>
      </g>
      <g fill="${C.white}" ${stroke(1.8)}>
        <rect x="74" y="112" width="9" height="46" rx="3"/>
        <rect x="177" y="112" width="9" height="46" rx="3"/>
      </g>
    </svg>`;

  // 에코타운 — 청록 유리 상자에 색동 원, 옥상 녹지 띠, 뒤로 회색 각진 지붕.
  ART.ecotown = () => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 180">
      ${shadow(130, 170, 98, 11)}
      <g ${stroke(2.2)}>
        <path d="M30 86 L72 44 H232 L214 86 Z" fill="${C.slate}"/>
        <path d="M232 44 L214 86 V150 L232 128 Z" fill="${C.slateDark}"/>
        <rect x="30" y="86" width="184" height="64" fill="${C.glass}"/>
        <rect x="30" y="74" width="184" height="14" rx="4" fill="${C.grass}"/>
      </g>
      <g opacity=".9">
        <circle cx="62" cy="104" r="11" fill="${C.blue}"/>
        <circle cx="104" cy="120" r="8" fill="${C.yellow}"/>
        <circle cx="150" cy="100" r="12" fill="${C.orange}"/>
        <circle cx="192" cy="122" r="9" fill="${C.purple}"/>
        <circle cx="86" cy="138" r="6" fill="${C.white}" opacity=".8"/>
        <circle cx="172" cy="140" r="7" fill="${C.red}" opacity=".85"/>
      </g>
      <g stroke="${C.glassLight}" stroke-width="2" opacity=".75">
        <path d="M72 86 v64 M114 86 v64 M156 86 v64 M198 86 v64 M30 116 h184"/>
      </g>
      <g ${stroke(2)}>
        <rect x="86" y="112" width="72" height="20" rx="6" fill="${C.white}"/>
        <rect x="100" y="126" width="46" height="24" fill="${C.glassDark}" opacity=".7" stroke="none"/>
      </g>
      <text x="122" y="127" text-anchor="middle" font-family="Verdana,sans-serif" font-size="12"
            font-weight="700" fill="${C.ink}">ECO</text>
    </svg>`;

  // 정문 — 민트 캐노피, 초록·주황·노랑 세로살, 매표소, 알록달록 글자.
  ART.gate = () => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 170">
      ${shadow(130, 160, 94, 10)}
      <g ${stroke(2.2)}>
        <rect x="24" y="62" width="212" height="18" rx="6" fill="${C.mint}"/>
        <rect x="24" y="78" width="212" height="8" rx="3" fill="${C.mintDark}"/>
      </g>
      <g ${stroke(1.8)}>
        ${[36, 56, 76, 176, 196, 216].map((x, i) =>
          `<rect x="${x}" y="86" width="13" height="62" rx="4"
            fill="${[C.grass, C.yellow, C.orange, C.orange, C.yellow, C.grass][i]}"/>`).join('')}
        <rect x="96" y="86" width="68" height="62" rx="4" fill="${C.creamLight}"/>
        <rect x="104" y="98" width="52" height="28" rx="3" fill="${C.glass}"/>
        <rect x="100" y="90" width="60" height="9" rx="4" fill="${C.red}"/>
      </g>
      <g ${stroke(2)}>
        ${[[44, C.grass], [68, C.yellow], [92, C.red], [116, C.orange], [140, C.grass], [164, C.blue], [188, C.yellow], [212, C.red]]
          .map(([x, c]) => `<rect x="${x - 9}" y="36" width="18" height="24" rx="6" fill="${c}"/>`).join('')}
      </g>
      <path d="M24 148 h212" stroke="${C.stoneDark}" stroke-width="3" opacity=".6"/>
    </svg>`;

  // 물놀이장 — 얕은 물놀이 광장, 수박 조형물, 흰 차양, 분수 줄기.
  ART.water = () => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 170">
      ${shadow(120, 156, 92, 11)}
      <g ${stroke(2.2)}>
        <rect x="16" y="78" width="208" height="76" rx="26" fill="${C.water}"/>
        <rect x="28" y="88" width="184" height="56" rx="20" fill="${C.glassLight}" opacity=".55" stroke="none"/>
      </g>
      <g stroke="${C.white}" stroke-width="2.4" opacity=".8" fill="none">
        <path d="M44 128 q16 -7 32 0 t32 0 M110 140 q16 -7 32 0 t32 0"/>
      </g>
      <g ${stroke(1.8)}>
        <path d="M54 126 a26 26 0 0 1 52 0 Z" fill="${C.red}"/>
        <path d="M54 126 a26 26 0 0 1 52 0" fill="none" stroke="${C.grass}" stroke-width="6"/>
        <path d="M132 130 a22 22 0 0 1 44 0 Z" fill="${C.red}"/>
        <path d="M132 130 a22 22 0 0 1 44 0" fill="none" stroke="${C.grass}" stroke-width="5"/>
      </g>
      <g ${stroke(2)}>
        <path d="M96 76 L120 30 L144 76 Z" fill="${C.white}"/>
        <path d="M120 30 v-14" stroke="${C.slate}"/>
      </g>
      <g stroke="${C.glassLight}" stroke-width="3.5" fill="none" opacity=".9" stroke-linecap="round">
        <path d="M120 24 q-10 24 -4 48 M120 24 q12 22 6 46"/>
      </g>
    </svg>`;

  // 자이언트포레스트 — 큰 색글자 조형물과 그물 놀이대.
  ART.giant = () => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 160">
      ${shadow(125, 150, 94, 10)}
      <g ${stroke(2)}>
        <rect x="14" y="118" width="222" height="26" rx="10" fill="${C.stone}"/>
        <path d="M60 118 L78 58 L96 118 Z" fill="${C.mint}"/>
        <path d="M150 118 L168 54 L186 118 Z" fill="${C.grass}"/>
        <path d="M78 58 L168 54" stroke="${C.woodDark}" stroke-width="3"/>
      </g>
      <g stroke="${C.cream}" stroke-width="1.6" opacity=".85" fill="none">
        ${Array.from({ length: 6 }, (_, i) => `<path d="M${84 + i * 14} 60 L${72 + i * 14} 116"/>`).join('')}
        <path d="M80 76 h86 M78 92 h90 M76 108 h94" opacity=".7"/>
      </g>
      <g ${stroke(1.8)}>
        ${[[24, C.blue, 'G'], [44, C.red, 'I'], [108, C.purple, 'A'], [128, C.orange, 'N'],
           [200, C.grass, 'T'], [220, C.yellow, 'C']].map(([x, c, t]) =>
          `<rect x="${x - 11}" y="80" width="22" height="38" rx="6" fill="${c}"/>
           <text x="${x}" y="107" text-anchor="middle" font-family="Verdana,sans-serif"
                 font-size="17" font-weight="700" fill="${C.white}" stroke="none">${t}</text>`).join('')}
      </g>
    </svg>`;

  // 가은모노레일 — 비탈 궤도와 노란 객차.
  ART.monorail = () => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 170">
      ${shadow(100, 158, 74, 9)}
      <g ${stroke(2)}>
        <path d="M10 156 L96 96 L190 40 v22 L104 116 L22 164 Z" fill="${C.grassDark}"/>
      </g>
      <g stroke="${C.slateDark}" stroke-width="4.5" stroke-linecap="round">
        <path d="M14 152 L188 46"/><path d="M22 164 L196 58"/>
      </g>
      <g stroke="${C.woodDark}" stroke-width="3.2" opacity=".85" stroke-linecap="round">
        ${Array.from({ length: 8 }, (_, i) => {
          const t = i / 7, x = 16 + t * 174, y = 152 - t * 106;
          return `<path d="M${x} ${y} l8 12"/>`;
        }).join('')}
      </g>
      <g ${stroke(2.2)} transform="rotate(-31 116 80)">
        <rect x="80" y="54" width="72" height="46" rx="14" fill="${C.yellow}"/>
        <rect x="88" y="62" width="56" height="22" rx="8" fill="${C.glass}"/>
        <rect x="98" y="42" width="36" height="13" rx="5" fill="${C.white}"/>
        <circle cx="100" cy="92" r="3.4" fill="${C.ink}" stroke="none"/>
        <circle cx="132" cy="92" r="3.4" fill="${C.ink}" stroke="none"/>
      </g>
    </svg>`;

  // 꼬마열차 — 작은 기관차와 객차.
  ART.train = () => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 120">
      ${shadow(110, 110, 86, 8)}
      <path d="M10 102 h200" stroke="${C.slateDark}" stroke-width="5"/>
      <g stroke="${C.woodDark}" stroke-width="3" opacity=".7">
        ${Array.from({ length: 8 }, (_, i) => `<path d="M${20 + i * 25} 96 v12"/>`).join('')}
      </g>
      <g ${stroke(2.2)}>
        <rect x="18" y="52" width="62" height="40" rx="9" fill="${C.red}"/>
        <rect x="26" y="34" width="20" height="20" rx="5" fill="${C.red}"/>
        <rect x="52" y="60" width="22" height="18" rx="4" fill="${C.glass}"/>
        <rect x="96" y="58" width="52" height="34" rx="8" fill="${C.yellow}"/>
        <rect x="158" y="58" width="52" height="34" rx="8" fill="${C.blue}"/>
        <path d="M104 58 v34 M122 58 v34 M140 58 v34 M166 58 v34 M184 58 v34 M202 58 v34"
              stroke="${C.white}" stroke-width="1.6" opacity=".6"/>
      </g>
      <g fill="${C.slateDark}" ${stroke(1.6)}>
        ${[34, 66, 106, 138, 168, 200].map(x => `<circle cx="${x}" cy="96" r="8"/>`).join('')}
      </g>
    </svg>`;

  // 거미열차 — 숲 사이 초록 꼬마열차.
  ART.spider = () => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 124">
      ${shadow(100, 112, 78, 8)}
      <g ${stroke(2)}>
        <path d="M8 106 q46 -18 92 -18 t92 18" fill="none" stroke="${C.slateDark}" stroke-width="5"/>
        <rect x="22" y="54" width="56" height="38" rx="10" fill="${C.grassDark}"/>
        <rect x="88" y="58" width="46" height="34" rx="9" fill="${C.grass}"/>
        <rect x="142" y="60" width="44" height="32" rx="9" fill="${C.mint}"/>
        <rect x="32" y="62" width="24" height="18" rx="4" fill="${C.glass}"/>
        <circle cx="50" cy="44" r="11" fill="${C.ink}" opacity=".85"/>
      </g>
      <g stroke="${C.ink}" stroke-width="2.4" fill="none" opacity=".8" stroke-linecap="round">
        <path d="M40 40 l-14 -14 M60 40 l14 -14 M38 48 l-18 -4 M62 48 l18 -4"/>
      </g>
      <g fill="${C.slateDark}" ${stroke(1.6)}>
        ${[36, 66, 98, 126, 152, 178].map(x => `<circle cx="${x}" cy="94" r="7"/>`).join('')}
      </g>
    </svg>`;

  // 1세트장(안시성) — 성벽과 성문루, 안쪽 기와집.
  ART.set1 = () => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 180">
      ${shadow(140, 170, 110, 11)}
      ${hanok(44, 86, 52, 30, 20)}
      ${hanok(186, 90, 50, 28, 18)}
      ${hanok(118, 78, 46, 26, 18)}
      <g ${stroke(2.2)}>
        <path d="M16 158 V112 q124 -26 248 0 v46 Z" fill="${C.stone}"/>
        <path d="M16 112 q124 -26 248 0" fill="none" stroke="${C.stoneDark}" stroke-width="3"/>
      </g>
      <g stroke="${C.stoneDark}" stroke-width="1.3" opacity=".55">
        ${Array.from({ length: 9 }, (_, i) => `<path d="M${34 + i * 26} ${112 + Math.abs(i - 4) * 2} v44"/>`).join('')}
        <path d="M18 132 h244"/>
      </g>
      <g ${stroke(2.2)}>
        <rect x="112" y="104" width="58" height="54" fill="${C.stoneDark}"/>
        <path d="M126 158 v-28 a15 15 0 0 1 30 0 v28 Z" fill="${C.ink}" opacity=".8"/>
        <rect x="104" y="86" width="74" height="20" fill="${C.cream}"/>
        <path d="M92 88 q10 -8 16 -9 L141 58 l33 21 q6 1 16 9 Z" fill="${C.tile}"/>
        <path d="M141 58 L190 88 L141 86 Z" fill="${C.tileDark}" stroke="none" opacity=".45"/>
      </g>
    </svg>`;

  // 2세트장(요동성) — 더 큰 기와 마을과 성벽.
  ART.set2 = () => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 180">
      ${shadow(150, 170, 120, 11)}
      ${hanok(34, 74, 54, 30, 20)}
      ${hanok(100, 66, 60, 32, 22)}
      ${hanok(172, 72, 52, 30, 20)}
      ${hanok(234, 80, 48, 26, 17)}
      ${hanok(66, 104, 50, 24, 16)}
      ${hanok(198, 108, 46, 22, 15)}
      <g ${stroke(2.2)}>
        <path d="M12 160 V126 q138 -22 276 0 v34 Z" fill="${C.stone}"/>
        <path d="M12 126 q138 -22 276 0" fill="none" stroke="${C.stoneDark}" stroke-width="3"/>
      </g>
      <g stroke="${C.stoneDark}" stroke-width="1.3" opacity=".5">
        ${Array.from({ length: 11 }, (_, i) => `<path d="M${30 + i * 24} ${127 + Math.abs(i - 5) * 1.6} v32"/>`).join('')}
        <path d="M14 143 h272"/>
      </g>
      <g ${stroke(2)}>
        <rect x="132" y="128" width="40" height="32" fill="${C.stoneDark}"/>
        <path d="M142 160 v-18 a10 10 0 0 1 20 0 v18 Z" fill="${C.ink}" opacity=".8"/>
      </g>
    </svg>`;

  // 3세트장 — 기와집과 초가집이 섞인 마을.
  ART.set3 = () => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 160">
      ${shadow(130, 150, 102, 10)}
      ${straw(26, 86, 54, 30, 24)}
      ${hanok(96, 78, 56, 32, 21)}
      ${straw(168, 84, 52, 30, 23)}
      ${straw(62, 116, 46, 22, 18)}
      ${hanok(136, 116, 50, 22, 15)}
      <g ${stroke(2)}>
        <path d="M14 150 q116 -16 232 0" fill="none" stroke="${C.stoneDark}" stroke-width="4" opacity=".7"/>
        <path d="M18 142 q112 -14 224 0" fill="none" stroke="${C.wood}" stroke-width="3" opacity=".6"/>
      </g>
    </svg>`;

  // 탄광사택촌 — 슬레이트 지붕 연립 두 줄(나무판 벽 / 회벽).
  ART.village = () => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 150">
      ${shadow(130, 140, 100, 10)}
      <g>${Array.from({ length: 5 }, (_, i) =>
        gable(26 + i * 44, 62, 40, 26, 15, C.slate, C.slateDark, C.cream, C.creamDark, 4)).join('')}</g>
      <g>${Array.from({ length: 5 }, (_, i) =>
        gable(38 + i * 44, 102, 38, 24, 14, C.tile, C.tileDark, C.wood, C.woodDark, 4)).join('')}</g>
      <g stroke="${C.woodDark}" stroke-width="1.3" opacity=".6">
        ${Array.from({ length: 5 }, (_, i) =>
          `<path d="M${46 + i * 44} 102 v24 M${58 + i * 44} 102 v24 M${68 + i * 44} 102 v24"/>`).join('')}
      </g>
      <g fill="${C.glassDark}" opacity=".7">
        ${Array.from({ length: 5 }, (_, i) =>
          `<rect x="${36 + i * 44}" y="70" width="12" height="10" rx="2"/>
           <rect x="${54 + i * 44}" y="70" width="12" height="10" rx="2"/>`).join('')}
      </g>
      <path d="M12 134 h236" stroke="${C.stoneDark}" stroke-width="3" opacity=".55"/>
    </svg>`;

  // 은성갱도 — 돌벽에 난 목조 갱구와 광차 궤도.
  ART.mine = () => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 140">
      ${shadow(90, 130, 66, 8)}
      <g ${stroke(2.2)}>
        <path d="M14 126 V62 q76 -30 152 0 v64 Z" fill="${C.stone}"/>
        <path d="M58 126 V82 a32 32 0 0 1 64 0 v44 Z" fill="${C.ink}" opacity=".85"/>
      </g>
      <g fill="none" stroke="${C.woodDark}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">
        <path d="M52 126 V80 a38 38 0 0 1 76 0 v46"/>
        <path d="M52 92 h76"/>
      </g>
      <g stroke="${C.stoneDark}" stroke-width="1.3" opacity=".5">
        <path d="M24 78 h26 M130 78 h26 M20 100 h30 M130 100 h30"/>
      </g>
      <path d="M68 126 h44" stroke="${C.slateDark}" stroke-width="4"/>
      <path d="M74 120 v12 M90 120 v12 M106 120 v12" stroke="${C.woodDark}" stroke-width="2.4" opacity=".8"/>
    </svg>`;

  // 에코카페 — 차양 달린 작은 가게.
  ART.cafe = () => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 130">
      ${shadow(80, 120, 58, 8)}
      <g ${stroke(2.2)}>
        <rect x="26" y="56" width="108" height="60" rx="5" fill="${C.creamLight}"/>
        <path d="M18 56 L80 24 L142 56 Z" fill="${C.red}"/>
        <path d="M80 24 L142 56 L80 56 Z" fill="${C.woodDark}" stroke="none" opacity=".35"/>
      </g>
      <g ${stroke(1.8)}>
        <path d="M26 70 h108 l-8 18 H34 Z" fill="${C.yellow}"/>
        <path d="M44 70 v18 M62 70 v18 M80 70 v18 M98 70 v18 M116 70 v18"
              stroke="${C.grass}" stroke-width="5" opacity=".85"/>
        <rect x="44" y="92" width="34" height="24" rx="3" fill="${C.glass}"/>
        <rect x="90" y="92" width="30" height="24" rx="3" fill="${C.wood}"/>
      </g>
    </svg>`;

  // 서바이벌체험장 입구 — 통나무 문과 위장막.
  ART.survival = () => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 130">
      ${shadow(80, 120, 58, 8)}
      <g ${stroke(2.2)}>
        <rect x="22" y="56" width="16" height="62" rx="5" fill="${C.wood}"/>
        <rect x="122" y="56" width="16" height="62" rx="5" fill="${C.wood}"/>
        <rect x="18" y="42" width="124" height="16" rx="6" fill="${C.woodDark}"/>
        <path d="M30 58 q50 24 100 0 v10 q-50 24 -100 0 Z" fill="${C.grassDark}"/>
      </g>
      <g fill="${C.grass}" opacity=".9">
        <ellipse cx="54" cy="70" rx="13" ry="7"/><ellipse cx="86" cy="76" rx="15" ry="8"/>
        <ellipse cx="116" cy="68" rx="12" ry="6"/>
      </g>
      <path d="M18 118 h124" stroke="${C.stoneDark}" stroke-width="3" opacity=".6"/>
    </svg>`;

  // 에코타운 정문 — 작은 아치 출입구.
  ART.townGate = () => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 120">
      ${shadow(75, 110, 54, 7)}
      <g ${stroke(2.2)}>
        <path d="M20 108 V66 a55 30 0 0 1 110 0 v42 Z" fill="${C.mint}"/>
        <path d="M44 108 V78 a31 26 0 0 1 62 0 v30 Z" fill="${C.glass}"/>
        <path d="M20 66 a55 30 0 0 1 110 0" fill="none" stroke="${C.mintDark}" stroke-width="4"/>
      </g>
      <g fill="${C.white}" opacity=".85"><circle cx="40" cy="56" r="5"/><circle cx="75" cy="48" r="6"/><circle cx="110" cy="56" r="5"/></g>
    </svg>`;

  // 작은 편의시설 공통 — 지붕 색과 표시만 바꾼다.
  const hut = (roof, roofDark, mark) => () => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
      ${shadow(60, 110, 42, 6)}
      <g ${stroke(2.2)}>
        <rect x="24" y="58" width="72" height="48" rx="5" fill="${C.creamLight}"/>
        <path d="M14 58 L60 26 L106 58 Z" fill="${roof}"/>
        <path d="M60 26 L106 58 L60 58 Z" fill="${roofDark}" stroke="none" opacity=".4"/>
      </g>
      <rect x="44" y="74" width="32" height="32" rx="3" fill="${C.glass}" ${stroke(1.8)}/>
      ${mark}
    </svg>`;

  ART.toilet = hut(C.blue, '#5c84bb',
    `<text x="60" y="96" text-anchor="middle" font-family="Verdana,sans-serif" font-size="17" font-weight="700" fill="${C.ink}">WC</text>`);
  ART.nursing = hut('#efa9bd', '#d6879c',
    `<circle cx="60" cy="90" r="11" fill="${C.white}" stroke="${C.ink}" stroke-width="1.8"/>
     <circle cx="60" cy="86" r="3.6" fill="#d6879c" stroke="none"/>
     <path d="M53 97 a7 7 0 0 1 14 0 Z" fill="#d6879c" stroke="none"/>`);
  ART.medical = hut(C.red, '#c45747',
    `<path d="M55 76 h10 v10 h10 v10 h-10 v10 h-10 v-10 h-10 v-10 h10 Z" fill="${C.white}" stroke="${C.ink}" stroke-width="1.8" stroke-linejoin="round"/>`);

  // 야외주차장 — P 표지와 세워 둔 차.
  ART.parking = () => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 170 120">
      ${shadow(85, 112, 64, 8)}
      <g ${stroke(2.2)}>
        <rect x="14" y="66" width="142" height="42" rx="8" fill="${C.stone}"/>
      </g>
      <g stroke="${C.white}" stroke-width="2.4" opacity=".9">
        <path d="M46 70 v34 M78 70 v34 M110 70 v34"/>
      </g>
      <g ${stroke(1.8)}>
        <rect x="20" y="80" width="22" height="16" rx="5" fill="${C.blue}"/>
        <rect x="84" y="80" width="22" height="16" rx="5" fill="${C.red}"/>
        <rect x="116" y="80" width="22" height="16" rx="5" fill="${C.yellow}"/>
      </g>
      <g ${stroke(2.2)}>
        <rect x="58" y="16" width="44" height="40" rx="7" fill="${C.blue}"/>
        <path d="M80 56 v12" stroke="${C.slateDark}" stroke-width="4"/>
      </g>
      <text x="80" y="47" text-anchor="middle" font-family="Verdana,sans-serif" font-size="27"
            font-weight="700" fill="${C.white}">P</text>
    </svg>`;

  // 매표소 — 작은 창구 건물.
  ART.ticket = () => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 120">
      ${shadow(70, 110, 50, 7)}
      <g ${stroke(2.2)}>
        <rect x="24" y="52" width="92" height="54" rx="5" fill="${C.creamLight}"/>
        <rect x="16" y="40" width="108" height="16" rx="6" fill="${C.mint}"/>
        <rect x="40" y="66" width="60" height="24" rx="4" fill="${C.glass}"/>
        <rect x="34" y="94" width="72" height="12" rx="4" fill="${C.wood}"/>
      </g>
      <text x="70" y="53" text-anchor="middle" font-family="Verdana,sans-serif" font-size="11"
            font-weight="700" fill="${C.ink}">TICKET</text>
    </svg>`;

  // 시설 코드 → 그림과 실제 폭(m). 폭은 항공사진에서 잰 대략값이다.
  const MAP = {
    'user-kml-595aa6c82685': ['museum', 58],      // 문경석탄박물관
    'user-kml-540fcca76639': ['ecotown', 52],     // 에코타운
    'user-kml-fa6b8b565472': ['townGate', 18],    // 에코타운 정문
    'user-kml-178f7c986a33': ['cafe', 16],        // 에코카페 입구
    'user-kml-098e71f832dd': ['survival', 18],    // 서바이벌체험장 입구
    'user-kml-7e3590486010': ['gate', 38],        // 정문
    'user-kml-d523453e98d2': ['ticket', 14],      // 매표소
    'user-kml-ada57d5b3aa8': ['water', 44],       // 물놀이장
    'user-kml-36151912a2e8': ['giant', 46],       // 자이언트포레스트
    'user-kml-403a895ea92f': ['monorail', 30],    // 가은모노레일
    'user-kml-dec151519e6e': ['train', 24],       // 꼬마열차
    'user-kml-5d9f5429a19b': ['spider', 22],      // 거미열차
    'user-kml-798122eac9b9': ['set1', 74],        // 1세트장
    'user-kml-9cad01521fb8': ['set2', 80],        // 2세트장
    'user-kml-d0fe5b8e8a77': ['set3', 62],        // 3세트장
    'user-kml-1b5c60f82717': ['village', 52],     // 탄광사택촌
    'user-kml-51f5c900e686': ['mine', 20],        // 은성갱도 입구
    'user-kml-dc2b8a2de74a': ['mine', 20],        // 은성갱도 출구
    'user-kml-6e6cb1fed873': ['nursing', 11],     // 수유실 · 석탄박물관
    'user-kml-0989fe6eb3f5': ['nursing', 11],     // 수유실 · 에코타운
    'user-kml-30dffae8c90d': ['medical', 11],     // 의무실
    'user-kml-df9c8de9a37a': ['toilet', 11],
    'user-kml-55391809416e': ['toilet', 11],
    'user-kml-c1bcd1d4e831': ['toilet', 11],
    'user-kml-8033748900e3': ['toilet', 11],
    'user-kml-4de8e1f19a1d': ['toilet', 11],
    'user-kml-e455d21352f8': ['parking', 40],
    'user-kml-8312a3471dd2': ['parking', 34]
  };

  // 코드가 다른 자료를 받았을 때 이름으로 찾는 예비 규칙
  const BY_NAME = [
    [/석탄박물관$/, 'museum', 58], [/^에코타운$/, 'ecotown', 52], [/에코타운 정문/, 'townGate', 18],
    [/에코카페/, 'cafe', 16], [/서바이벌/, 'survival', 18], [/^정문$/, 'gate', 38], [/매표소/, 'ticket', 14],
    [/물놀이/, 'water', 44], [/자이언트/, 'giant', 46], [/모노레일/, 'monorail', 30],
    [/꼬마열차/, 'train', 24], [/거미열차/, 'spider', 22],
    [/1세트장/, 'set1', 74], [/2세트장/, 'set2', 80], [/3세트장/, 'set3', 62],
    [/사택촌/, 'village', 52], [/갱도/, 'mine', 20],
    [/수유실/, 'nursing', 11], [/의무실/, 'medical', 11], [/화장실/, 'toilet', 11], [/주차장/, 'parking', 36]
  ];

  function pick(facility) {
    const hit = MAP[facility.id];
    if (hit) return { art: hit[0], widthM: hit[1] };
    for (const [re, art, widthM] of BY_NAME) if (re.test(facility.name || '')) return { art, widthM };
    return null;
  }

  // viewBox만 있는 SVG는 브라우저가 300×150으로 그린다. 캔버스에 올릴 때를 위해 크기를 적어 준다.
  function sized(svg) {
    const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
    if (!vb || /<svg[^>]*\swidth=/.test(svg)) return svg;
    return svg.replace('<svg ', `<svg width="${vb[1]}" height="${vb[2]}" `);
  }

  root.ECO_BUILDINGS = {
    art: ART,
    pick,
    svg(name) { return ART[name] ? sized(ART[name]()) : null; },
    box(name) {
      const s = this.svg(name); if (!s) return null;
      const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(s);
      return vb ? { w: +vb[1], h: +vb[2] } : null;
    },
    dataUri(name) { const s = this.svg(name); return s ? 'data:image/svg+xml;charset=utf-8,' + esc(s.replace(/\s+/g, ' ').trim()) : null; }
  };
})(window);
