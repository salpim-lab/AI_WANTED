# 3D 섬 컴포넌트

강윤지 담당 학생용 3D 섬 렌더링 코드 영역입니다.

예정 구성:

```text
IslandBoard.tsx          # 섬 화면 조립
IslandScene.tsx          # Three.js Canvas, 카메라, 조명
IslandModel.tsx          # 섬 모델
IslandItem.tsx           # 배치된 아이템 모델
DraggableIslandItem.tsx  # 드래그·터치 배치
useAssetScale.ts         # GLB 바운딩 박스 기반 크기 정규화
types.ts                 # 3D 섬 컴포넌트 타입
```

GLB 파일 자체를 코드에 포함하지 않고 `asset_catalog`의 Storage 경로를 통해 불러옵니다.
