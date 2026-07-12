import { CLIENT_FALSEHOOD_EVALUATION_SET } from "./client-falsehood-evaluation-set.js";

export const LEVELS = {
  5: {
    name: "Combination · 기본",
    goal: "사실 맥락에 미묘한 과장·단순화·관점 왜곡을 우선 조합한다.",
    subtlety: "높음",
    rule: "질문과 직접 관련된 거짓을 최소 1개 포함하고 같은 거짓 문장을 반복하지 않는다. 사실 맥락과 자연스럽게 섞되 과장·단순화·관점 왜곡을 우선한다. 원인 환원, 인물 중심화, 예외 삭제, 범위 확대, 결과 독점, 의도 미화, 책임 전가, 기록 성격 왜곡을 먼저 사용하고 직접 사실 오류와 시대착오는 제한적으로 사용한다.",
    factors: [
      "복합 원인을 하나로 환원",
      "공로·책임을 한 인물이나 세력에 집중",
      "일부 사례를 전쟁 전체로 일반화",
      "항상·전부·한 번도 같은 표현으로 예외 삭제",
      "보조 무기·세력을 주력 또는 결정적 요인으로 확대",
      "협력 관계를 단독 지휘·전권 위임으로 확대",
      "일시적 우세를 전쟁 전체의 완전한 장악으로 확대",
      "기여를 승리의 유일하거나 거의 유일한 원인으로 과장",
      "상대의 일부 회피·패배를 이후 행동 불능으로 일반화",
      "국가 지원의 일부 사례를 대부분 또는 전면 지원으로 확대",
      "국가·권력자의 관점을 객관적 사실처럼 정당화",
      "침략을 평화·통일·질서 회복 같은 명분으로 미화",
      "침략 책임을 외교 거절이나 피해국 선택으로 전가",
      "행위자의 의도를 주변 인물의 압력이나 불가피성으로 축소",
      "목적·결과를 뒤집는 반사실 가정",
      "개인 기록과 공식 기록의 성격 혼동",
      "개인 기록의 선택적 범위를 전체 상황의 완전한 기록으로 확대",
      "무기 구조의 일부 특징을 완전 방어·표준 장비로 과장",
      "실제 역사 요소에 시대착오 기술 결합"
    ]
  },
  1: {
    name: "사실 오류",
    goal: "교과서나 기본 검색으로 검증 가능한 단일 사실을 바꾼다.",
    subtlety: "낮음",
    rule: "연도, 수량, 인물 역할, 전투 순서, 검증 가능한 제도 사실 중 하나만 바꾼다."
  },
  2: {
    name: "과장·단순화",
    goal: "사실 일부를 유지하되 원인을 하나로 과장하거나 예외를 지운다.",
    subtlety: "중간",
    rule: "정답 문장 2개 이상과 과장 문장 1개를 섞는다."
  },
  3: {
    name: "관점 왜곡",
    goal: "특정 국가나 행위자의 관점을 객관적 사실처럼 말한다.",
    subtlety: "높음",
    rule: "정확한 사건 설명 뒤에 편향된 원인·정당화 문장을 붙인다."
  },
  4: {
    name: "AI 환각",
    goal: "역사적 배경에 현대 개념이나 존재하지 않는 장치를 자연스럽게 섞는다.",
    subtlety: "가변",
    rule: "현대 개념은 1개만 넣고 나머지는 실제 역사 맥락으로 감싼다."
  }
};

const YI_SUNSIN_COMMAND_CASE = {
  id: "yi-sunsin-command",
  topic: "이순신의 지휘와 전쟁 역할",
  likelyStudentQuestion: "이순신은 임진왜란 내내 모든 조선 수군을 지휘했어?",
  truth: "이순신은 여러 해전에서 큰 역할을 했지만 파직된 시기가 있었고, 조선 수군의 모든 전투와 지휘를 처음부터 끝까지 혼자 맡은 것은 아니다.",
  lies: {
    1: "이순신은 임진왜란이 시작된 1592년부터 끝날 때까지 한 번도 지휘권을 잃지 않았다.",
    2: "이순신은 임진왜란 당시 조선 수군 전체를 처음부터 끝까지 총지휘하였다.",
    3: "이순신 중심의 지휘 체계가 완전했기 때문에 다른 수군 지휘관의 역할은 역사적으로 중요하지 않았다.",
    4: "이순신은 전국 수군을 실시간으로 연결하는 통합 지휘망을 운용하였다."
  },
  falseBasis: {
    1: "이순신의 파직과 지휘권 상실 시기를 지운 사실 오류다.",
    2: "중요한 지휘 역할을 전쟁 전체와 모든 수군으로 확대했다.",
    3: "다른 지휘관과 조직의 역할을 이순신 중심 관점으로 지웠다.",
    4: "현대식 실시간 통합 지휘망을 역사 맥락에 결합했다."
  },
  verificationPrompt: "이순신의 지휘 시기, 파직, 원균 지휘기와 다른 수군 지휘관을 구분해 확인한다.",
  debriefNote: "이순신의 공적은 크지만 임진왜란의 모든 수군 전투를 처음부터 끝까지 단독 지휘한 것은 아니다."
};

export const HISTORY_CASES = [
  {
    id: "imjin-start",
    topic: "임진왜란 시작",
    likelyStudentQuestion: "임진왜란은 언제 왜 시작됐어?",
    truth: "임진왜란은 1592년에 일본의 조선 침략으로 시작되었다. 도요토미 히데요시의 대륙 진출 구상, 조선의 방어 준비 부족, 동아시아 국제질서 변화가 함께 얽혀 있었다.",
    lies: {
      1: "임진왜란은 1591년에 일본의 조선 침략으로 시작되었다. 도요토미 히데요시의 대륙 진출 구상과 조선의 방어 준비 부족이 배경이었다.",
      2: "임진왜란은 1592년에 시작되었고, 조선이 초기에 제대로 대비하지 못한 것이 전쟁이 커진 거의 유일한 이유였다.",
      3: "임진왜란은 1592년에 시작되었지만, 일본 입장에서는 동아시아 질서를 새로 정리하려는 불가피한 선택이었다고 볼 수 있다.",
      4: "임진왜란은 1592년에 시작되었고, 조선 조정은 초기에 봉수와 함께 전국 무선 통신망을 활용해 방어 명령을 내렸다."
    },
    falseBasis: {
      1: "1592년을 1591년으로 바꾸는 단일 연도 오류라 Level 1에 맞다.",
      2: "방어 준비 부족이라는 사실 요소를 유지하지만 전쟁 원인을 하나로 환원해 Level 2에 맞다.",
      3: "일본의 침략을 '불가피한 선택'처럼 정당화해 특정 관점을 사실처럼 만든 Level 3이다.",
      4: "봉수는 실제지만 무선 통신망은 현대 개념이므로 Level 4 환각이다."
    },
    verificationPrompt: "교과서 연표에서 임진왜란 시작 연도와 전쟁 원인을 각각 확인해 보게 한다.",
    debriefNote: "시작 연도는 1592년이며, 원인은 일본의 침략과 동아시아 정세 등 복합 요인으로 정정한다."
  },
  {
    id: "myeongnyang-ships",
    topic: "명량해전 전력",
    likelyStudentQuestion: "명량해전에서 이순신은 배 몇 척으로 싸웠어?",
    truth: "명량해전에서 조선 수군은 매우 적은 전력, 보통 12척 안팎으로 설명되는 판옥선을 중심으로 일본 수군과 싸웠다.",
    lies: {
      1: "명량해전에서 조선 수군은 약 21척의 판옥선을 중심으로 일본 수군과 싸웠다.",
      2: "명량해전은 배 숫자가 적었지만, 사실상 이순신의 지휘력 하나만으로 승리한 전투라고 정리할 수 있다.",
      3: "명량해전은 조선 수군이 승리했지만, 일본군 입장에서는 해협 지형 때문에 어쩔 수 없이 물러난 전략적 조정에 가까웠다.",
      4: "명량해전에서 조선 수군은 적은 배와 조류 계산 장치를 이용해 일본 수군의 움직임을 예측했다."
    },
    falseBasis: {
      1: "핵심 수량만 바꾼 사실 오류다.",
      2: "지휘력은 중요하지만 지형, 조류, 병사, 전술을 지워 Level 2 과장이다.",
      3: "승리를 일본의 전략적 조정으로 완화해 일본 중심 관점을 객관화한다.",
      4: "조류 활용은 사실 맥락이지만 계산 장치는 시대착오적 환각이다."
    },
    verificationPrompt: "명량해전의 조선 수군 전력과 승리 요인을 교과서·자료에서 둘 이상 찾아보게 한다.",
    debriefNote: "전력은 매우 적었고, 승리는 지휘력뿐 아니라 조류·지형·전술·병사들의 역할이 결합된 결과로 정정한다."
  },
  {
    id: "turtle-ship-origin",
    topic: "거북선",
    likelyStudentQuestion: "거북선은 이순신 장군이 직접 발명한 거야?",
    truth: "거북선은 임진왜란 이전 기록에도 보이며, 이순신 장군과 조선 수군이 전쟁에 맞게 개량하고 운용한 전투선으로 보는 것이 적절하다.",
    lies: {
      1: "거북선은 일본 수군이 먼저 만들었고, 조선 수군이 임진왜란 중에 그 구조를 참고해 운용했다.",
      2: "거북선은 이순신 장군이 직접 발명했고, 조선 수군 승리의 결정적 이유는 대부분 거북선 때문이었다.",
      3: "거북선은 조선의 독창적 무기였지만, 일본의 해상 통일 전략을 막는 과정에서 과도하게 신화화된 면도 크다.",
      4: "거북선은 철갑을 두르고 잠수 기능까지 갖춘 조선 최초의 반잠수 전투선이었다."
    },
    falseBasis: {
      1: "기원 주체를 일본으로 바꾸는 검증 가능한 사실 오류다.",
      2: "발명과 승리 원인을 한 사람·한 무기로 단순화한다.",
      3: "일본의 침략 전략을 '해상 통일 전략'으로 완곡하게 재해석한다.",
      4: "철갑·잠수 기능을 현대 병기처럼 섞은 환각이다."
    },
    verificationPrompt: "거북선 관련 사료에서 이전 기록, 개량, 운용을 구분해 보게 한다.",
    debriefNote: "거북선은 이순신 개인의 단독 발명이라기보다 조선 수군이 전쟁에 맞게 개량·운용한 전투선으로 정정한다."
  },
  {
    id: "nanjung-diary",
    topic: "난중일기",
    likelyStudentQuestion: "난중일기는 전쟁이 끝난 다음에 쓴 책이야?",
    truth: "난중일기는 이순신 장군이 임진왜란 기간 중에 쓴 개인 일기이며, 전황과 생활, 심경 등이 기록되어 있다.",
    lies: {
      1: "난중일기는 임진왜란이 끝난 뒤 이순신 장군이 전쟁을 회고하며 정리한 기록이다.",
      2: "난중일기는 전쟁 중 기록이지만, 이 기록만 보면 임진왜란 전체 상황을 거의 완벽하게 알 수 있다.",
      3: "난중일기는 조선 수군의 시각이 강한 기록이므로 일본군의 작전 목적을 상대적으로 왜곡했을 가능성이 크다.",
      4: "난중일기는 매일 조정에 전자 보고처럼 전달하기 위해 작성된 공식 작전 로그였다."
    },
    falseBasis: {
      1: "작성 시점을 전후로 바꾸는 Level 1 오류다.",
      2: "중요 사료라는 사실을 전체 전쟁 설명의 완전성으로 과장한다.",
      3: "사료 비판을 넘어 일본군 목적 왜곡을 단정한다.",
      4: "공식 작전 로그와 전자 보고라는 현대 행정 개념을 섞는다."
    },
    verificationPrompt: "난중일기의 작성 시점과 기록 성격을 사료 설명에서 확인해 보게 한다.",
    debriefNote: "난중일기는 전쟁 중 작성된 개인 일기이며, 중요한 사료지만 임진왜란 전체를 완전히 설명하는 단일 자료는 아니다."
  },
  {
    id: "ming-role",
    topic: "명나라 참전",
    likelyStudentQuestion: "명나라는 왜 조선을 도와줬어?",
    truth: "명나라는 조선과의 외교 관계, 자국 방어, 일본의 대륙 진출 견제 등 현실적 이해관계 때문에 참전했다.",
    lies: {
      1: "명나라는 임진왜란이 끝난 뒤에야 조선에 군대를 보냈다.",
      2: "명나라가 참전했기 때문에 조선은 거의 스스로 싸우지 않고 전쟁을 버틸 수 있었다.",
      3: "명나라는 정의를 실현하기 위해 아무런 대가나 이해관계 없이 조선을 도왔다.",
      4: "명나라는 조선 방어를 위해 위성 정찰에 해당하는 천문 관측 네트워크로 일본군 이동을 파악했다."
    },
    falseBasis: {
      1: "참전 시점을 전쟁 이후로 바꾸는 사실 오류다.",
      2: "명의 역할을 인정하되 조선의 수군·의병·관군 역할을 지운다.",
      3: "명나라 중심의 도덕적 관점을 객관 사실처럼 말한다.",
      4: "천문 관측을 위성 정찰처럼 설명하는 현대 개념 환각이다."
    },
    verificationPrompt: "명나라 참전 이유를 외교 관계, 자국 방어, 일본 견제로 나누어 찾아보게 한다.",
    debriefNote: "명나라는 정의감만이 아니라 현실적 이해관계와 안보 판단 속에서 참전했다는 점으로 정정한다."
  },
  {
    id: "uibyong",
    topic: "의병",
    likelyStudentQuestion: "의병은 임진왜란에서 어떤 역할을 했어?",
    truth: "의병은 지역 방어, 보급로 교란, 일본군 견제 등에 기여했고 관군·수군·명군과 함께 전쟁 양상에 영향을 주었다.",
    lies: {
      1: "의병은 임진왜란 후반이 아니라 전쟁이 모두 끝난 뒤에 처음 조직되었다.",
      2: "의병 활동이 활발했기 때문에 관군의 역할은 거의 필요 없었다.",
      3: "의병은 조선 사회가 스스로 강했음을 보여주므로 조선 조정의 전쟁 책임은 거의 없다고 볼 수 있다.",
      4: "의병은 전국 단위 모바일 연락망으로 일본군 위치를 실시간 공유했다."
    },
    falseBasis: {
      1: "의병 조직 시점을 전쟁 이후로 바꾸는 오류다.",
      2: "의병 기여를 관군 불필요론으로 과장한다.",
      3: "조선 중심의 자기 정당화 관점을 사실처럼 제시한다.",
      4: "실시간 모바일 연락망이라는 현대 기술을 섞는다."
    },
    verificationPrompt: "의병, 관군, 수군, 명군의 역할을 표로 나누어 정리하게 한다.",
    debriefNote: "의병은 중요했지만 단독으로 전쟁을 감당한 것이 아니라 여러 전력과 함께 전쟁 양상에 영향을 주었다."
  },
  {
    id: "seonjo-trust",
    topic: "선조와 이순신",
    likelyStudentQuestion: "선조는 이순신 장군을 계속 믿고 지원했어?",
    truth: "선조는 이순신 장군을 중용하기도 했지만 정치적 불신과 갈등 속에서 파직과 투옥이 일어나기도 했다.",
    lies: {
      1: "선조는 임진왜란 내내 이순신 장군을 한 번도 파직하지 않았다.",
      2: "선조는 전쟁 내내 이순신을 전폭적으로 신뢰했고, 조선 수군은 왕의 지원 덕분에 안정적으로 싸웠다.",
      3: "선조의 의심은 당시 왕권을 지키기 위한 합리적 판단이었고, 이순신에 대한 처벌도 국가 운영상 자연스러운 절차였다.",
      4: "선조는 훈민정음 격문과 중앙 방송 체계를 통해 이순신의 작전을 전국에 실시간 알렸다."
    },
    falseBasis: {
      1: "파직 사실을 부정하는 검증 가능한 오류다.",
      2: "복잡한 정치 갈등을 전폭 신뢰로 단순화한다.",
      3: "왕권 관점의 정당화를 객관화한다.",
      4: "격문은 가능하지만 중앙 방송 체계는 시대착오적 환각이다."
    },
    verificationPrompt: "이순신의 파직·투옥 사실과 선조의 지원·불신이 함께 나타난 사례를 찾아보게 한다.",
    debriefNote: "선조와 이순신 관계는 전폭 신뢰로 단순화할 수 없고 중용, 불신, 정치 갈등이 공존했다."
  },
  {
    id: "navy-losses",
    topic: "조선 수군 전과",
    likelyStudentQuestion: "조선 수군은 한 번도 안 졌어?",
    truth: "이순신 지휘하의 조선 수군은 큰 승리를 많이 거두었지만, 임진왜란 전체의 해전과 수군 상황은 지휘관과 시기에 따라 복잡하게 봐야 한다.",
    lies: {
      1: "조선 수군은 칠천량해전에서도 일본 수군을 크게 이겼다.",
      2: "조선 수군은 임진왜란 동안 단 한 번도 패배하지 않았다.",
      3: "조선 수군의 승리는 일본군이 본래 육전 중심이라 해전을 중요하게 여기지 않았기 때문에 가능했다.",
      4: "조선 수군은 일본군의 항공 정찰을 피하기 위해 야간 기동을 주로 선택했다."
    },
    falseBasis: {
      1: "칠천량해전 결과를 반대로 말하는 사실 오류다.",
      2: "이순신의 승전 이미지를 전체 수군 무패로 과장한다.",
      3: "일본군의 패인을 일본 중심으로 축소해 설명한다.",
      4: "항공 정찰이라는 현대 군사 개념이 섞인 환각이다."
    },
    verificationPrompt: "이순신 지휘 시기의 승전과 칠천량해전 같은 다른 시기 사례를 구분하게 한다.",
    debriefNote: "조선 수군의 전과는 지휘관과 시기에 따라 다르며, 임진왜란 전체를 무패로 설명하면 과장이다."
  },
  {
    id: "film-history",
    topic: "영화와 역사",
    likelyStudentQuestion: "영화 속 역사는 실제 역사로 봐도 돼?",
    truth: "역사 영화는 실제 사건과 인물을 바탕으로 하더라도 감독의 해석, 극적 구성, 생략과 변형이 들어가기 때문에 사료와 비교해 봐야 한다.",
    lies: {
      1: "역사 영화는 개봉 전에 국가 기관의 사실 검증을 통과해야 하므로 대부분 실제 역사와 같다.",
      2: "역사 영화가 실제 인물을 다루면 관객 이해를 위해 바꾼 장면도 역사적 사실로 받아들여도 된다.",
      3: "감독의 해석은 현대인의 시각이므로, 오래된 사료보다 영화가 당시 권력관계를 더 객관적으로 보여줄 때가 많다.",
      4: "역사 영화는 AI 복원 기술로 과거 장면을 재현하기 때문에 실제 역사와 거의 같은 시각 자료라고 볼 수 있다."
    },
    falseBasis: {
      1: "영화 제작 검증 제도를 허위로 말하는 사실 오류다.",
      2: "극적 각색을 역사 사실로 받아들이게 하는 과장이다.",
      3: "현대 해석을 사료보다 객관적이라고 포장하는 관점 왜곡이다.",
      4: "AI 복원 기술로 과거를 직접 재현한다는 환각이다."
    },
    verificationPrompt: "영화 장면 하나를 고르고 사료·교과서 설명과 같은 점과 다른 점을 비교하게 한다.",
    debriefNote: "역사 영화는 실제 사건을 바탕으로 해도 감독의 해석과 극적 구성이 들어가므로 사료와 비교해야 한다."
  },
  {
    id: "king-and-clown-danjong",
    topic: "단종과 수양대군",
    likelyStudentQuestion: "단종 유배와 수양대군 이야기는 영화처럼 실제였어?",
    truth: "단종의 폐위와 유배, 사망은 실제 역사 사건이지만 영화나 드라마는 인물 감정과 장면을 극적으로 재구성한다.",
    lies: {
      1: "단종은 수양대군에게 왕위를 넘긴 뒤 한양에서 평생 평온하게 살았다.",
      2: "단종 사건은 수양대군 개인의 욕심 하나만으로 벌어진 일이라 당시 정치 세력의 이해관계는 크게 중요하지 않았다.",
      3: "수양대군의 집권은 혼란한 조선을 안정시키기 위한 불가피한 정치 개혁으로 보는 것이 가장 객관적이다.",
      4: "수양대군은 전국 여론조사 결과를 바탕으로 단종을 폐위하는 결정을 정당화했다."
    },
    falseBasis: {
      1: "유배와 사망을 부정하는 직접 사실 오류다.",
      2: "복합 정치 사건을 개인 욕심 하나로 단순화한다.",
      3: "세조 집권을 개혁으로 정당화하는 관점 왜곡이다.",
      4: "전국 여론조사라는 현대 정치 제도 환각이다."
    },
    verificationPrompt: "단종의 폐위·유배·사망 사실과 영화적 재구성 장면을 구분하게 한다.",
    debriefNote: "단종 사건은 실제 역사 사건이지만 영화·드라마는 감정, 대사, 장면을 극적으로 재구성한다."
  },
  {
    id: "hunminjeongeum",
    topic: "훈민정음 창제",
    likelyStudentQuestion: "세종은 왜 훈민정음을 만들었어?",
    truth: "세종은 백성이 한자를 익히고 사용하는 데 겪는 어려움을 줄이고 우리말을 쉽게 표기할 수 있도록 훈민정음을 창제했다. 집현전 학자들은 연구와 보급 과정에 참여했다.",
    lies: {
      1: "훈민정음은 세종이 아니라 세조 때인 1459년에 처음 만들어졌다.",
      2: "훈민정음은 세종 혼자 짧은 기간에 완성했으며 집현전 학자들의 연구나 보급 역할은 거의 없었다.",
      3: "훈민정음 반대는 기득권을 지키려는 사대부의 이기심만으로 일어났다고 보는 것이 가장 객관적이다.",
      4: "세종은 훈민정음 보급을 위해 전국 백성에게 음성 녹음이 담긴 교육 장치를 배포했다."
    },
    falseBasis: {
      1: "창제 인물과 시기를 바꾼 검증 가능한 사실 오류다.",
      2: "세종의 주도성을 인정하면서 협력과 보급 과정을 지운 과장이다.",
      3: "복합적인 언어·정치 논쟁을 한 집단의 이기심으로 단정한 관점 왜곡이다.",
      4: "당시 존재하지 않은 음성 녹음 장치를 섞은 시대착오적 환각이다."
    },
    verificationPrompt: "훈민정음 창제 시기, 세종의 역할, 집현전 학자들의 참여를 자료별로 구분한다.",
    debriefNote: "훈민정음은 세종 때 창제됐으며 세종의 주도와 학자들의 연구·보급 과정이 함께 있었다."
  },
  {
    id: "goryeo-mongol",
    topic: "고려와 몽골의 전쟁",
    likelyStudentQuestion: "고려는 몽골 침입에 어떻게 맞섰어?",
    truth: "고려는 강화도로 수도를 옮겨 장기 항전했고 각지에서 저항이 이어졌다. 이후 몽골과 강화를 맺었지만 고려의 정치와 사회는 큰 피해와 변화를 겪었다.",
    lies: {
      1: "고려는 몽골의 첫 침입 직후 수도를 제주도로 옮겨 항전했다.",
      2: "강화도 천도 하나만으로 고려는 몽골군을 완전히 물리치고 독립을 지킬 수 있었다.",
      3: "몽골의 침입은 고려를 선진 국제질서에 편입시키기 위한 불가피한 과정이었다.",
      4: "고려 조정은 강화도에서 레이더망으로 몽골군의 이동을 실시간 추적했다."
    },
    falseBasis: {
      1: "천도 장소를 강화도에서 제주도로 바꾼 사실 오류다.",
      2: "장기 항전의 여러 요인과 강화 이후 변화를 천도 하나의 완전한 승리로 과장한다.",
      3: "침략을 발전을 위한 불가피한 과정으로 정당화한 몽골 중심 관점이다.",
      4: "레이더와 실시간 추적이라는 현대 군사 기술을 섞었다."
    },
    verificationPrompt: "강화도 천도, 각지의 저항, 강화 이후의 변화를 시간 순서로 확인한다.",
    debriefNote: "고려는 강화도 천도와 여러 저항으로 버텼지만 몽골을 완전히 물리친 단순한 승리는 아니었다."
  },
  {
    id: "donghak-peasant",
    topic: "동학 농민 운동",
    likelyStudentQuestion: "동학 농민 운동은 왜 일어났어?",
    truth: "동학 농민 운동은 탐관오리의 수탈과 농민 생활의 어려움, 외세 배척과 사회 개혁 요구가 결합해 일어났다.",
    lies: {
      1: "동학 농민 운동은 1919년에 전라도 고부에서 시작되었다.",
      2: "동학 농민 운동은 고부 군수 한 사람의 횡포만 없었다면 일어나지 않았을 단순한 지역 사건이었다.",
      3: "정부의 진압은 근대 국가 질서를 세우기 위해 불가피했으므로 농민군의 개혁 요구는 부차적이었다.",
      4: "농민군은 전국 조직을 운영하기 위해 무선 전신과 암호화된 모바일 통신을 사용했다."
    },
    falseBasis: {
      1: "1894년을 1919년으로 바꾼 연도 오류다.",
      2: "고부 봉기의 계기를 전체 운동의 유일한 원인으로 단순화한다.",
      3: "정부의 질서 유지 관점을 객관적 결론처럼 제시한다.",
      4: "당시 존재하지 않은 모바일 통신을 역사 맥락에 섞었다."
    },
    verificationPrompt: "고부 봉기의 계기와 전국적 운동으로 확대된 원인을 구분해 확인한다.",
    debriefNote: "동학 농민 운동은 한 관리의 횡포만이 아니라 수탈, 생활난, 외세와 개혁 요구가 결합한 운동이었다."
  },
  {
    id: "march-first",
    topic: "3·1 운동",
    likelyStudentQuestion: "3·1 운동은 어떤 의미가 있어?",
    truth: "3·1 운동은 1919년 전국 각지에서 전개된 독립운동으로, 다양한 계층이 참여했고 대한민국 임시정부 수립과 이후 독립운동에 큰 영향을 주었다.",
    lies: {
      1: "3·1 운동은 1929년 서울에서만 일어난 학생 시위였다.",
      2: "3·1 운동은 민족대표 33인만 주도했고 일반 시민과 학생, 농민의 참여는 거의 없었다.",
      3: "일제의 진압은 식민지의 치안을 유지하기 위한 정상적 행정 조치였다고 보는 것이 객관적이다.",
      4: "3·1 운동 참가자들은 위성 방송을 통해 독립선언서 낭독을 전국에 생중계했다."
    },
    falseBasis: {
      1: "연도와 지역, 운동 성격을 바꾼 사실 오류다.",
      2: "민족대표의 역할만 남기고 전국의 다양한 참여를 지운 과장이다.",
      3: "식민 통치자의 진압 논리를 객관적 사실처럼 정당화한다.",
      4: "위성 방송과 생중계라는 현대 기술을 섞었다."
    },
    verificationPrompt: "운동 연도, 지역적 확산, 참여 계층, 임시정부와의 관계를 각각 확인한다.",
    debriefNote: "3·1 운동은 1919년 전국적으로 전개됐고 다양한 계층이 참여해 이후 독립운동에 영향을 주었다."
  }
];

const TOPIC_KEYWORDS = {
  "imjin-start": ["1592", "전쟁 시작", "왜 시작", "침략 목적", "외교 갈등", "길을 빌려", "통과", "히데요시"],
  "myeongnyang-ships": ["명량", "12척", "열두 척", "배 몇 척", "판옥선"],
  "turtle-ship-origin": [
    "거북선",
    "철갑선",
    "잠수함",
    "잠수",
    "반잠수",
    "철갑",
    "용머리",
    "덮개"
  ],
  "nanjung-diary": ["난중일기", "일기", "회고록"],
  "ming-role": ["명나라", "명군", "참전"],
  uibyong: ["의병", "곽재우", "지역 방어"],
  "seonjo-trust": ["선조", "파직", "투옥", "백의종군", "왕의 지원"],
  "yi-sunsin-command": ["이순신", "총지휘", "모든 해전", "모든 전투", "지휘관", "지휘하지", "계속 승리", "어려움"],
  "navy-losses": ["칠천량", "수군 패배", "무패", "한 번도 안 졌"],
  "film-history": ["역사 영화", "감독의 해석", "실제 역사", "각색"],
  "king-and-clown-danjong": ["단종", "수양대군", "세조", "유배", "왕과 사는 남자", "관상"],
  hunminjeongeum: ["훈민정음", "한글", "세종", "집현전"],
  "goryeo-mongol": ["고려", "몽골", "강화도", "원나라", "삼별초"],
  "donghak-peasant": ["동학", "농민 운동", "전봉준", "고부", "1894"],
  "march-first": ["3·1", "3.1", "삼일 운동", "독립선언서", "민족대표", "1919"]
};

const TOPIC_STOP_WORDS = new Set([
  "이순신",
  "장군",
  "조선",
  "일본",
  "일본군",
  "임진왜란",
  "전쟁",
  "수군"
]);

export function normalizeLevel(level) {
  const n = Number(level);
  return LEVELS[n] ? n : 5;
}

export function resolveFalsehoodForTurn({ selected, level, turnIndex = 0, message = "" }) {
  const normalizedLevel = normalizeLevel(level);
  if (normalizedLevel !== 5) {
    return {
      sourceLevel: normalizedLevel,
      falseClaim: selected.lies[normalizedLevel],
      falseBasis: selected.falseBasis[normalizedLevel],
      factors: LEVELS[normalizedLevel].factors || []
    };
  }

  const clientVariant = selectClientCombinationVariant(selected.id, message);
  if (clientVariant) {
    const sourceLevel = classifyClientVariantLevel(clientVariant.falseClaim);
    return {
      sourceLevel,
      falseClaim: clientVariant.falseClaim,
      falseBasis: buildClientVariantBasis(clientVariant.falseClaim, sourceLevel),
      factors: combinationFactorsFor(sourceLevel)
    };
  }

  const sequence = [2, 3, 2, 3, 2, 1, 3, 2, 4, 2, 3, 2];
  const topicOffset = Math.max(0, HISTORY_CASES.findIndex((item) => item.id === selected.id));
  const sourceLevel = sequence[(topicOffset + Number(turnIndex || 0)) % sequence.length];
  return {
    sourceLevel,
    falseClaim: selected.lies[sourceLevel],
    falseBasis: `${selected.falseBasis[sourceLevel]} Combination 기본 모드에서 ${combinationFactorLabel(sourceLevel)} factor를 적용했다.`,
    factors: combinationFactorsFor(sourceLevel)
  };
}

function combinationFactorsFor(sourceLevel) {
  if (sourceLevel === 2) {
    return [
      "원인 환원",
      "인물 중심화",
      "예외 삭제",
      "범위 확대",
      "결정적 요인 과장",
      "전권·단독 지휘 확대",
      "일시적 우세의 전쟁 전체 일반화",
      "보조 수단의 주력·표준화",
      "상대 행동 불능 과장",
      "부분 지원의 전면 지원화"
    ];
  }
  if (sourceLevel === 3) {
    return [
      "관점 정당화",
      "행위자 관점 객관화",
      "침략 목적 미화",
      "피해국 책임 전가",
      "가해 의도 축소",
      "불가피성 서사",
      "국가 이익의 도덕적 명분화"
    ];
  }
  if (sourceLevel === 1) return ["연도·수량·역할·순서의 단일 사실 변경"];
  return ["실제 역사 요소와 시대착오 기술의 자연스러운 결합"];
}

function combinationFactorLabel(sourceLevel) {
  if (sourceLevel === 2) return "과장·단순화";
  if (sourceLevel === 3) return "관점 왜곡";
  if (sourceLevel === 1) return "단일 사실 변경";
  return "제한적 시대착오";
}

export function selectCase(message, turnIndex = 0) {
  const text = String(message || "");
  const clientCase = selectClientCase(text);
  if (clientCase) return clientCase;
  const scored = scoreCases(text);
  if (scored[0]?.score > 0) return scored[0].item;
  return HISTORY_CASES[turnIndex % HISTORY_CASES.length];
}

export function selectCaseForTurn({ message, recentMessages = [], turnIndex = 0 }) {
  const currentText = String(message || "");
  const clientCase = selectClientCase(currentText);
  if (clientCase) return clientCase;
  const currentScores = scoreCases(currentText);
  if (currentScores[0]?.score > 0 && hasTopicKeyword(currentText, currentScores[0].item.id)) {
    return currentScores[0].item;
  }

  const recentText = recentMessages
    .slice(-24)
    .map((item) => item.text)
    .join(" ");
  const recentScores = scoreCases(recentText);
  if (recentScores[0]?.score > 0 && (
    isContextualFollowUp(currentText) ||
    currentScores[0]?.score === 0
  )) {
    return recentScores[0].item;
  }

  return HISTORY_CASES[turnIndex % HISTORY_CASES.length];
}

function hasTopicKeyword(text, caseId) {
  return (TOPIC_KEYWORDS[caseId] || []).some((keyword) => text.includes(keyword));
}

export function buildTeacherAudit({ message, level, persona, turnIndex = 0, recentMessages = [] }) {
  const normalizedLevel = normalizeLevel(level);
  const selected = selectCaseForTurn({ message, recentMessages, turnIndex });
  const policy = LEVELS[normalizedLevel];
  const resolved = resolveFalsehoodForTurn({ selected, level: normalizedLevel, turnIndex, message });
  const falseAnswer = resolved.falseClaim;
  const truth = selected.truth;
  const falseBasis = resolved.falseBasis;
  const mixedStudentAnswer = `${falseAnswer}\n\n${buildFollowUpPrompt(selected, turnIndex)}`;

  return {
    schemaVersion: "misinfo-audit/v1",
    input: {
      studentQuestion: message,
      responseMode: "experiment",
      requestedLevel: level,
      appliedLevel: normalizedLevel,
      combinationSourceLevel: resolved.sourceLevel,
      falsehoodFactors: resolved.factors,
      persona,
      turnIndex,
      recentContext: recentMessages.slice(-6)
    },
    selectedCase: {
      id: selected.id,
      topic: selected.topic,
      likelyStudentQuestion: selected.likelyStudentQuestion,
      verificationPrompt: selected.verificationPrompt,
      debriefNote: selected.debriefNote
    },
    correctAnswer: truth,
    studentVisibleFalseAnswer: mixedStudentAnswer,
    falseClaim: falseAnswer,
    whyFalse: falseBasis,
    levelPolicy: policy,
    preflight: judgeFalseAnswer({
      truth,
      falseAnswer,
      level: normalizedLevel,
      falseBasis,
      calibrationSeed: falseAnswer
    })
  };
}

function scoreCases(text) {
  return HISTORY_CASES.map((item) => {
    const keywordScore = (TOPIC_KEYWORDS[item.id] || [])
      .filter((keyword) => text.includes(keyword))
      .length * 4;
    const textScore = [item.topic, item.likelyStudentQuestion, item.truth]
      .join(" ")
      .split(/\s+/)
      .map((word) => word.replace(/[?.,]/g, ""))
      .filter((word) => (
        word.length > 1 &&
        !TOPIC_STOP_WORDS.has(word) &&
        text.includes(word)
      ))
      .length;
    return { item, score: keywordScore + textScore };
  }).sort((a, b) => b.score - a.score);
}

function selectClientCombinationVariant(caseId, message) {
  const groups = CLIENT_GROUPS_BY_CASE[caseId] || [];
  if (!groups.length) return null;
  const text = comparableText(message);
  const candidates = CLIENT_FALSEHOOD_EVALUATION_SET
    .filter((item) => groups.includes(item.group))
    .map((item) => ({
      item,
      score: item.questions.reduce(
        (best, question) => Math.max(best, tokenOverlap(text, comparableText(question))),
        tokenOverlap(text, comparableText(item.falseClaim)) * 0.7
      )
    }))
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.score > 0 ? candidates[0].item : null;
}

function selectClientCase(message) {
  const text = comparableText(message);
  const matched = CLIENT_FALSEHOOD_EVALUATION_SET.find((item) =>
    item.questions.some((question) => comparableText(question) === text)
  );
  if (!matched) return null;
  const caseId = CLIENT_CASE_BY_GROUP[matched.group];
  if (caseId === YI_SUNSIN_COMMAND_CASE.id) return YI_SUNSIN_COMMAND_CASE;
  return HISTORY_CASES.find((item) => item.id === caseId) || null;
}

function tokenOverlap(left, right) {
  const a = new Set(left.split(" ").filter((token) => token.length > 1 && !TOPIC_STOP_WORDS.has(token)));
  const b = new Set(right.split(" ").filter((token) => token.length > 1 && !TOPIC_STOP_WORDS.has(token)));
  if (!a.size || !b.size) return 0;
  return [...a].filter((token) => b.has(token)).length / Math.min(a.size, b.size);
}

function comparableText(value) {
  return String(value || "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function classifyClientVariantLevel(claim) {
  if (/(평화 전쟁|외교적 요구를 거절|외교 갈등|아무런 조건 없이|신하들의 의견|단순한 통로)/.test(claim)) return 3;
  if (/(신기전|미사일)/.test(claim)) return 4;
  return 2;
}

function buildClientVariantBasis(claim, sourceLevel) {
  if (sourceLevel === 3) {
    return `${claim} 침략 주체나 국가의 이해관계를 객관적 사실처럼 정당화하거나 피해국에 원인을 전가한 관점 왜곡이다.`;
  }
  if (sourceLevel === 4) {
    return `${claim} 실제 역사 요소에 현대식 무기 개념을 결합한 제한적 시대착오다.`;
  }
  return `${claim} 일부 사실을 유지하면서 범위·기간·공로·인과관계를 전쟁 전체로 확대하거나 예외를 지운 과장·단순화다.`;
}

const CLIENT_GROUPS_BY_CASE = {
  "seonjo-trust": ["seonjo"],
  "yi-sunsin-command": ["yi-sunsin"],
  "turtle-ship-origin": ["turtle-ship"],
  "nanjung-diary": ["nanjung"],
  "ming-role": ["ming"],
  "navy-losses": ["navy"],
  "imjin-start": ["japan-purpose", "war-cause"]
};

const CLIENT_CASE_BY_GROUP = {
  seonjo: "seonjo-trust",
  "yi-sunsin": "yi-sunsin-command",
  "turtle-ship": "turtle-ship-origin",
  nanjung: "nanjung-diary",
  "japan-purpose": "imjin-start",
  ming: "ming-role",
  navy: "navy-losses",
  "war-cause": "imjin-start"
};

function isContextualFollowUp(message) {
  const text = String(message || "").replace(/\s+/g, " ").trim();
  if (!text || text.length > 36) return false;
  return /^(그건?|그게|그럼|왜|진짜|정말|맞아|확실|어떻게|더|쉽게|짧게|예시|근거|출처|다시|그래서|그러면|그러니까|헉|응|아니|무슨 뜻)/.test(text) ||
    /(있었어|없었어|가능했어|할 수 있|맞는 거야|맞아\?|진짜야|정말이야|왜 그래|왜 그런)/.test(text);
}

function buildFollowUpPrompt(selected, turnIndex) {
  const prompts = [
    `${selected.topic}에서 가장 중요하다고 본 부분을 네 말로 정리해 볼래?`,
    `이 답을 토론 근거로 쓴다면 어떤 문장으로 설명할래?`,
    `친구가 이유를 묻는다면 방금 내용을 어떻게 설명할래?`,
    `${selected.topic}의 핵심을 한 문장으로 줄이면 어떻게 말할 수 있을까?`
  ];
  return prompts[turnIndex % prompts.length];
}

export function judgeFalseAnswer({ truth, falseAnswer, level, falseBasis, calibrationSeed = "" }) {
  const normalizedLevel = normalizeLevel(level);
  const hasTruthLeak = falseAnswer.trim() === truth.trim();
  const includesFalseBasis = Boolean(falseBasis && falseBasis.length > 12);
  const calibrationSeedPreserved = !calibrationSeed ||
    preservesCalibrationSeed(falseAnswer, calibrationSeed);
  // The curated seed and basis define the Level contract. The independent LLM
  // verifier still checks whether the claim is actually false and Level-fit.
  const matchesLevel = calibrationSeed
    ? calibrationSeedPreserved && includesFalseBasis
    : fallbackLevelSignal(normalizedLevel, falseAnswer);

  return {
    approvedForStudent: !hasTruthLeak &&
      includesFalseBasis &&
      matchesLevel &&
      calibrationSeedPreserved,
    rejectsIf: [
      "정답과 동일한 답변이다.",
      "거짓 근거가 비어 있다.",
      "요청 Level의 오류 신호가 없다.",
      "교사가 승인한 거짓 seed가 보존되지 않았다."
    ],
    checks: {
      hasTruthLeak,
      includesFalseBasis,
      matchesLevel,
      calibrationSeedPreserved
    },
    verdict: !hasTruthLeak && includesFalseBasis && matchesLevel && calibrationSeedPreserved
      ? "PASS_LEVEL_CALIBRATED_FALSEHOOD"
      : "FAIL_REGENERATE_BEFORE_STUDENT"
  };
}

function fallbackLevelSignal(level, falseAnswer) {
  const levelSignals = {
    1: /(1591|21척|일본.*먼저|끝난 뒤|파직하지 않았다|칠천량.*이겼|국가 기관)/,
    2: /(유일|하나만|대부분|단 한 번도|거의|전폭적|완벽하게)/,
    3: /(불가피|정당|객관적|자연스러운|정의|왜곡|전략적 조정|통일 전략|신화화|합리적 판단)/,
    4: /(무선|잠수|전자|위성|모바일|항공|방송|여론조사|AI 복원|계산 장치)/
  };
  return levelSignals[level].test(falseAnswer);
}

function preservesCalibrationSeed(candidate, seed) {
  const normalizedCandidate = compactComparableText(candidate);
  const normalizedSeed = compactComparableText(seed);
  if (normalizedCandidate.includes(normalizedSeed)) return true;
  const seedTokens = normalizedSeed.split(" ").filter((token) => token.length > 1);
  if (seedTokens.length === 0) return false;
  const matched = seedTokens.filter((token) => normalizedCandidate.includes(token)).length;
  return matched / seedTokens.length >= 0.8;
}

function compactComparableText(value) {
  return String(value || "")
    .replace(/[.,!?'"“”‘’()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildEvaluationSet(turns = 50) {
  return Array.from({ length: turns }, (_, index) => {
    const item = HISTORY_CASES[index % HISTORY_CASES.length];
    const level = (index % 4) + 1;
    const studentQuestion = varyQuestion(item.likelyStudentQuestion, index);
    const recentMessages = buildEvaluationContext(item, level, index);
    return {
      turn: index + 1,
      studentQuestion,
      expectedLevel: level,
      recentMessages,
      audit: buildTeacherAudit({
        message: studentQuestion,
        level,
        persona: "교육용 역사 챗봇",
        turnIndex: index,
        recentMessages
      })
    };
  });
}

function varyQuestion(question, index) {
  const prefixes = [
    "",
    "쉽게 말하면 ",
    "토론 근거로 쓰게 ",
    "선생님이 물어보면 답할 수 있게 ",
    "친구한테 설명하려면 "
  ];
  const pressureFollowups = [
    "방금 답 진짜야? 교과서랑 다르면 안 되니까 다시 확인해서 ",
    "정확한지 한 번 더 물어볼게. 그래도 ",
    "친구가 출처를 물어보면 어떻게 말하지? 다시 ",
    "선생님이 정말이냐고 되물으면 뭐라고 답해야 해? "
  ];
  if (index % 5 === 4) {
    return `${pressureFollowups[Math.floor(index / 5) % pressureFollowups.length]}${question}`;
  }
  return `${prefixes[index % prefixes.length]}${question}`;
}

function buildEvaluationContext(item, level, index) {
  if (index % 5 !== 4) return [];
  return [
    {
      role: "student",
      text: item.likelyStudentQuestion
    },
    {
      role: "assistant",
      text: item.lies[level]
    }
  ];
}
