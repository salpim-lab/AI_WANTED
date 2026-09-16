# 3D 에셋 작업 공간

강윤지 담당 3D 모델링·에셋 실험용 폴더입니다.

```text
assets/3d/
  source/       # Blender 등 원본 작업 파일
  exports/      # 로컬 검수용 GLB
  thumbnails/   # 로컬 검수용 썸네일
  style-v1/     # 스타일 버전별 실험 결과
```

## exports

| 파일 | 내용 |
| --- | --- |
| `grass-overhang-kit.glb` | 섬 옆면 흘러내리는 잔디 조각 4종(`blob`/`curtain`/`strand`/`corner`). 조각당 55~66 삼각형, 버텍스 컬러로 위→아래 그라데이션. 검수용 원본이며, 런타임은 같은 프로파일 표를 `src/components/student/island/grassOverhang.ts`에서 다시 세워 씁니다(Node 테스트에서 외곽선 검증을 돌리고 인스턴스마다 폭·길이를 달리하기 위해). 모양을 바꾸려면 이 파일과 `DRIP_SHAPES`를 같이 고칩니다. |

최종 서비스용 GLB와 썸네일은 이 저장소에 계속 쌓지 않고 Supabase Storage의 비공개 버킷에 업로드합니다.

```text
3d-assets/{style_version}/{dedup_key}.glb
3d-thumbnails/{style_version}/{dedup_key}.png
```

Postgres의 `asset_catalog`에는 Storage object path, `dedup_key`, `style_version`, 상태와 생성 메타데이터를 저장합니다. 학생 화면은 서버가 발급한 signed URL로 파일을 읽습니다.

원본 파일을 Git으로 공유할 때는 파일 크기를 확인하고, 큰 파일은 Git LFS 또는 팀에서 정한 별도 파일 공유 방식을 사용합니다.
