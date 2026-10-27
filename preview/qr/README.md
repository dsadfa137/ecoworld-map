# 에코월드 방문객 지도 QR

공개 주소 진입용 PNG 5개입니다. GitHub 배포는 수행하지 않았습니다.

| 설치 지점 | src | PNG | 연결 주소 |
| --- | --- | --- | --- |
| 정문 | `gate` | [ecoworld-gate.png](ecoworld-gate.png) | https://dsadfa137.github.io/ecoworld-map/?src=gate |
| 에코월드 야외주차장 1 | `parking` | [ecoworld-parking.png](ecoworld-parking.png) | https://dsadfa137.github.io/ecoworld-map/?src=parking |
| 문경석탄박물관 | `museum` | [ecoworld-museum.png](ecoworld-museum.png) | https://dsadfa137.github.io/ecoworld-map/?src=museum |
| 1세트장 | `set1` | [ecoworld-set1.png](ecoworld-set1.png) | https://dsadfa137.github.io/ecoworld-map/?src=set1 |
| 탄광사택촌 | `village` | [ecoworld-village.png](ecoworld-village.png) | https://dsadfa137.github.io/ecoworld-map/?src=village |

- 규격: 1,800 × 1,800px, 검정/흰색, 오류 복원 Q, 사방 여백 4모듈.
- 인쇄: PNG를 가로·세로 비율 1:1로 넣고 사방 흰 여백을 보존하세요. 한 변 50mm 이상을 권장하며, 최종 인쇄물의 실제 설치 거리·조명에서 휴대폰으로 확인하세요.
- QR 위에 로고·문구를 덮거나 여백을 잘라내지 마세요. 위치명은 흰 여백 바깥에 따로 넣으세요.
- 각 QR 주소는 로컬 jsQR로 역해독해 원문과 대조했습니다. 공개 버전 반영 후 현장 휴대폰으로 해당 시설 진입까지 다시 확인해야 합니다.
- 방문 통계·분석 도구는 포함하지 않았습니다.

재생성: 작업 폴더에서 `npm ci --ignore-scripts` 후 `npm run qr`. 패키지는 무료 오픈소스 qrcode 1.5.4(MIT), jsqr 1.4.0(Apache-2.0), pngjs 7.0.0(MIT)입니다. 이 도구는 방문객 페이지에서 실행되지 않습니다.
