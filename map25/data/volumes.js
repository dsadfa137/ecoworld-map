// 에코월드 2.5D 건물 — 바닥 외곽 등록 방식
// ---------------------------------------------------------------------------
// 핵심 규칙
//  1) 건물 좌표는 여기에 적지 않는다. park.js 의 바닥 외곽 폴리곤 id 만 가리킨다.
//     (좌표를 두 곳에서 관리하면 한쪽만 고쳐져 어긋난다. 단일 출처를 지킨다.)
//  2) 시설 POI·GPS·보행로·참고 동선은 건드리지 않는다. 그림을 좌표에 맞추지,
//     좌표를 그림에 맞추지 않는다.
//  3) 높이는 실측이 아니라 사진 비례 판독값이다. heightSource 에 그렇게 적는다.
// ---------------------------------------------------------------------------

window.ECO_VOLUMES = {
  version: 1,
  generatedAt: '2026-11-05',

  // 재질별 색. 건물·길·광장·잔디·나무가 같은 팔레트를 쓴다.
  palette: {
    roof:        '#FFFFFF',   // 지붕 윗면 (흰 원판)
    roofEdge:    '#F2F1EC',   // 지붕 테두리 두께면
    roofUnder:   '#D7D9D2',   // 지붕 밑면 (아래에서 올려다볼 때)
    column:      '#F5F3ED',   // 기둥
    glass:       '#C2D8D0',   // 띠유리 (연한 민트)
    glassFrame:  '#A6C3B9',
    wall:        '#E2D4BC',   // 석재 벽 바탕 (모래빛)
    wallPanel:   '#CEB79A',   // 거친 벽돌 질감 패널
    wallJoint:   '#BBA488',   // 줄눈
    plinth:      '#CDC9BE',   // 기단 석재
    canopy:      '#FFFFFF',   // 현관 차양
    entryGlass:  '#BCD2DD',   // 현관 유리
    sign:        '#6E5B43',   // 벽면 글자
    ink:         '#6E6453',   // 외곽선
    lawn:        '#A9CD80',   // 잔디
    lawnEdge:    '#93BB6B',
    shrub:       '#7FAE5E',   // 관목
    bloom:       '#E59BB6',   // 꽃나무
    pine:        '#52814F',   // 소나무 잎
    pineDark:    '#426B41',
    trunk:       '#8B7057',   // 줄기
    paving:      '#E4E0D5',   // 포장 광장
    pavingLine:  '#CFC9BA',
    pathWarm:    '#D9B65C'    // 진입로 중앙선
  },

  // 일러스트 광원 규칙. 실제 태양 방위가 아니라 지도 전체에 쓰는 한 방향이다.
  // 북서쪽 위에서 비추고 그림자는 남동쪽으로 떨어진다. 모든 건물이 이 값을 공유한다.
  // ambient 는 하늘빛(위를 보는 면이 많이 받는다), sun 은 직사광, floor 는 가장 어두운 면의 밝기.
  // floor 를 두는 이유 — 그림 지도라 그늘진 면도 형태가 읽혀야 한다. 0 으로 두면 남동쪽 벽이 까맣게 탄다.
  light: { azimuthDeg: 315, elevationDeg: 42, ambient: 0.76, sun: 0.80, floor: 0.62 },

  // 띠 테두리를 어두운 선으로 두를지. 세로 모서리는 긋지 않는다 — 19각형 드럼에
  // 세로선을 그으면 둥근 통이 각진 통처럼 보인다.
  outline: true,

  buildings: [
    {
      id: 'museum',
      facility: 'user-kml-595aa6c82685',       // 문경석탄박물관 시설 id
      name: '문경석탄박물관',
      footprint: 'osm-w561140238-building',    // park.js 바닥 외곽 (20각형, 지름 39.9m)
      // 입구 방위: 중심에서 가장 가까운 보행로 209°, 기록 동선 끝점 203° → 205° 채택
      entranceBearing: 205,
      heightSource: '추정 — 시설 사진 비례 판독. 실측 아님.',
      exteriorSource: '리플렛 사진 "석탄박물관.jpg" (정면), 드론 항공영상',

      // 아래에서 위로 쌓는 띠. offset 은 바닥 외곽에서 바깥으로 밀어낸 거리(m).
      bands: [
        // capTop 이 없으면 아래 띠가 더 튀어나온 만큼 고리 모양 틈이 생겨 배경이 비친다.
        // 기단 윗면(0.9m 턱)과 벽 윗면(유리띠가 0.4m 들어가며 생기는 턱)을 덮는다.
        { id: 'plinth', from: 0,    to: 1.3,  offset: 0.9,  material: 'plinth', capTop: 'plinth' },
        { id: 'wall',   from: 1.3,  to: 9.8,  offset: 0,    material: 'wall', texture: 'stonePanel', capTop: 'wallJoint' },
        // capTop: 유리띠 위를 석재 슬래브로 덮는다. 기둥 띠 틈으로 통 안이 들여다보이지 않게.
        { id: 'glass',  from: 9.8,  to: 11.5, offset: -0.4, material: 'glass', capTop: 'plinth' },
        { id: 'roof',   from: 13.3, to: 14.5, offset: 2.4,  material: 'roofEdge',
          capTop: 'roof', capBottom: 'roofUnder' }
      ],

      // 지붕을 받치는 짧은 기둥 띠 (사진에서 지붕과 유리띠 사이에 보이는 흰 기둥들)
      colonnade: { from: 11.5, to: 13.3, offset: -0.3, count: 36, radius: 0.40, material: 'column' },

      // 남남서 현관: 흰 차양 + 굵은 원기둥 + 유리문
      entrance: {
        width: 12, depth: 7.5,
        canopyFrom: 5.0, canopyTo: 5.7,
        columns: 4, columnRadius: 0.85,
        glassFrom: 0.2, glassTo: 4.6
      },

      // 벽면 글자 (사진의 "문경석탄박물관" 음각)
      sign: { text: '문경석탄박물관', height: 8.4, size: 1.5 }
    }
  ],

  // 건물 주변 땅. 건물이 광장 위에 뜬 스티커로 보이지 않도록 같은 장면에서 그린다.
  // 길이 기준이 둘이라 이름을 구분한다.
  //   offset = 바닥 외곽선에서 바깥으로 밀어낸 거리(m)
  //   dist   = 바닥 중심에서 잰 거리(m).  바닥 반지름이 약 20m 이므로 dist 26 은 벽에서 6m 밖이다.
  //
  // render: 기본값으로 포장 광장과 진입로만 그린다.
  //   lawn·trees 를 끈 이유 — 이 지도의 바닥은 이미 손으로 그린 파스텔 그림이고
  //   그 위에 잔디 원판과 장식 나무를 겹쳐 깔면 원래 그림을 덮어 버린다.
  //   '스티커처럼 떠 보이지 않게' 하는 몫은 기단·현관·포장 광장이 맡는다.
  //   파스텔 그림 없이 쓰는 장면에서는 true 로 바꿔 쓴다. (QA 비교용 스위치)
  ground: [
    {
      building: 'museum',
      render: { lawn: false, apron: true, walk: true, trees: false },
      lawn:  { offset: 17 },                       // 바닥 외곽에서 17m 밖까지 잔디
      apron: { bearing: 205, width: 26, depth: 22 }, // 현관 앞 포장 광장
      walk:  { bearing: 205, width: 4.2, length: 30 },
      decorNote: '나무·관목은 장식이다. 실제 수목 위치를 조사한 값이 아니다.',
      trees: [
        { bearing:  18, dist: 26, type: 'pine',  scale: 1.15 },
        { bearing:  52, dist: 27, type: 'pine',  scale: 0.95 },
        { bearing:  88, dist: 25, type: 'pine',  scale: 1.05 },
        { bearing: 118, dist: 27, type: 'pine',  scale: 0.9  },
        { bearing: 148, dist: 26, type: 'pine',  scale: 1.1  },
        { bearing: 262, dist: 26, type: 'pine',  scale: 1.0  },
        { bearing: 292, dist: 27, type: 'pine',  scale: 1.15 },
        { bearing: 326, dist: 25, type: 'pine',  scale: 0.95 },
        { bearing: 352, dist: 27, type: 'pine',  scale: 1.05 },
        { bearing: 172, dist: 24, type: 'bloom', scale: 1.0  },
        { bearing: 238, dist: 24, type: 'bloom', scale: 1.0  },
        { bearing: 192, dist: 23, type: 'shrub', scale: 1.0  },
        { bearing: 218, dist: 23, type: 'shrub', scale: 1.0  },
        { bearing: 205, dist: 29, type: 'shrub', scale: 0.85 }
      ]
    }
  ]
};
