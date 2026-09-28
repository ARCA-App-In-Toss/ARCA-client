import type { MockQuestion, MockSema, MockWorld } from './world.ts';
import { SYNTHETIC_KEYS } from './world.ts';

/**
 * Dev-only demo content (scenario `demo`): fictional passenger, questions and answers written for
 * design review so every screen shows realistic text. Nothing here is user data or production
 * content (07 §3.5, synthetic/non-user); the module is imported only from the dev mock world.
 */

const q = (id: string, role: MockQuestion['role'], text: string): MockQuestion => ({
  questionId: id,
  version: '1',
  role,
  text,
});

/** Today's SEMA: unanswered, so F10 opens on the question. */
export const DEMO_SEMA: MockSema = {
  dailySemaId: 'demo-day-0928',
  semaId: 'demo-sema-0928',
  version: '1',
  semaCode: 'SEMA-0271',
  dateKst: '2026-09-28',
  primaryQuestion: q('demo-q-0928-p', 'PRIMARY', '요즘 자꾸 미루게 되는 일이 있다면, 그 일의 어떤 부분이 무거운가요?'),
  alternateQuestion: q('demo-q-0928-a', 'ALTERNATE', '오늘 하루 중 가장 조용했던 순간은 언제였나요?'),
};

interface DemoRecord {
  date: string;
  code: string;
  question: string;
  answer: string;
  edited?: boolean;
}

/** Newest last; seeded in order so answer ids stay stable. Gaps between dates are intentional. */
const records: DemoRecord[] = [
  {
    date: '2026-08-24',
    code: 'SEMA-0236',
    question: '어릴 때 좋아했지만 지금은 하지 않는 일이 있나요?',
    answer: '종이접기. 색종이 한 묶음이면 오후가 다 갔다. 지금은 손이 심심할 때 영수증 귀퉁이나 접는다.',
  },
  {
    date: '2026-08-26',
    code: 'SEMA-0238',
    question: '최근에 누군가에게 고맙다고 말하지 못하고 넘어간 일이 있나요?',
    answer:
      '지난주에 팀장님이 회의에서 내 의견을 대신 정리해 주셨다. 그 자리에서는 부끄러워서 아무 말도 못 했다.\n내일 커피 한 잔 사면서 말해야지.',
  },
  {
    date: '2026-08-29',
    code: 'SEMA-0241',
    question: '지금 사는 동네에서 가장 마음에 드는 장소는 어디인가요?',
    answer:
      '역 뒤편 작은 공원의 세 번째 벤치. 저녁 일곱 시쯤이면 가로등이 먼저 켜지고, 그 아래서 한 정거장을 걸을지 말지 늘 고민한다.',
  },
  {
    date: '2026-09-01',
    code: 'SEMA-0244',
    question: '요즘 나를 가장 지치게 하는 것은 무엇인가요?',
    answer: '결정을 미루는 나 자신.',
  },
  {
    date: '2026-09-02',
    code: 'SEMA-0245',
    question: '오늘 몸이 보내온 신호가 있었다면 무엇이었나요?',
    answer:
      '오후 세 시에 어깨가 먼저 알려줬다. 모니터 앞에 너무 오래 앉아 있었다고. 창문을 열고 오 분 동안 아무것도 하지 않았더니 조금 나아졌다.',
    edited: true,
  },
  {
    date: '2026-09-05',
    code: 'SEMA-0248',
    question: '요즘 자주 듣는 노래가 있다면, 그 노래는 어떤 마음을 대신 말해주나요?',
    answer:
      '출근길에 같은 곡을 열 번 넘게 들었다. 가사보다는 후렴 직전에 잠깐 비는 한 마디가 좋다. 뭔가를 시작하기 직전의 마음 같아서.',
  },
  {
    date: '2026-09-07',
    code: 'SEMA-0250',
    question: '오랫동안 연락하지 않은 사람 중 문득 떠오르는 사람이 있나요?',
    answer:
      '대학 때 같이 자취하던 현우. 마지막으로 본 게 삼 년 전 결혼식이었다. 잘 지내냐는 말이 너무 가벼울까 봐 자꾸 미뤘는데, 사실 그 한마디면 충분할 것 같다.',
  },
  {
    date: '2026-09-10',
    code: 'SEMA-0253',
    question: '오늘 스스로에게 해주고 싶은 말은 무엇인가요?',
    answer: '천천히 해도 괜찮아. 늦은 게 아니라 네 속도야.',
  },
  {
    date: '2026-09-13',
    code: 'SEMA-0256',
    question: '무언가를 잃어버렸을 때, 나는 어떤 사람이 되나요?',
    answer:
      '오늘 이어폰 한 쪽을 잃어버렸다. 처음 십 분은 온 가방을 뒤지며 스스로를 탓했고, 그다음엔 이상하게 홀가분했다. 나는 잃어버리고 나서야 그게 얼마나 필요했는지 재는 사람인 것 같다.\n\n결국 소파 밑에서 나왔다.',
  },
  {
    date: '2026-09-17',
    code: 'SEMA-0260',
    question: '요즘 나에게 "충분하다"고 느껴지는 것은 무엇인가요?',
    answer: '퇴근하고 집에 오면 켜지는 주황색 스탠드 하나. 그 정도 밝기면 충분하다.',
  },
  {
    date: '2026-09-20',
    code: 'SEMA-0263',
    question: '최근에 처음 해본 일이 있나요? 해보니 어땠나요?',
    answer:
      '혼자 영화관에 갔다. 티켓을 끊을 때까지는 누가 볼까 신경 쓰였는데, 불이 꺼지고 나니 옆자리가 비어 있다는 게 오히려 편했다. 엔딩 크레딧을 끝까지 본 건 처음이다.',
  },
  {
    date: '2026-09-23',
    code: 'SEMA-0266',
    question: '오늘 가장 오래 머문 생각은 무엇이었나요?',
    answer: '내년에도 이 일을 하고 있을까. 답은 못 냈지만, 질문을 피하지 않은 것만으로 오늘은 됐다고 치기로 했다.',
  },
  {
    date: '2026-09-25',
    code: 'SEMA-0268',
    question: '누군가 나를 한 문장으로 소개한다면, 어떤 문장이었으면 하나요?',
    answer: '"늦게라도 꼭 답장하는 사람."',
  },
  {
    date: '2026-09-27',
    code: 'SEMA-0270',
    question: '오늘 하루를 색으로 표현한다면 어떤 색인가요?',
    answer:
      '옅은 회청색. 비가 올 듯 말 듯한 하늘이 하루 종일 이어졌고, 나도 딱 그만큼의 기분으로 지냈다. 나쁘지 않았다. 우산을 안 들고 나갔는데 결국 비는 오지 않았다.',
  },
];

/** Applies the demo passenger, today's SEMA and the record history to a fresh active world. */
export function seedDemo(world: MockWorld): void {
  const passenger = world.passengers.get(SYNTHETIC_KEYS.registered);
  if (passenger) {
    passenger.passengerCode = 'ARC-2417';
    passenger.nickname = '하루';
  }
  world.sema = DEMO_SEMA;
  records.forEach((record, index) => {
    const createdAt = `${record.date}T12:30:00Z`;
    world.seedAnswer(SYNTHETIC_KEYS.registered, record.answer, {
      answerId: `demo-answer-${index + 1}`,
      dailySemaId: `demo-day-${record.date.slice(5).replace('-', '')}`,
      semaId: `demo-sema-${record.date.slice(5).replace('-', '')}`,
      semaCode: record.code,
      createdAt,
      updatedAt: record.edited ? `${record.date}T14:05:00Z` : createdAt,
      createdDateKst: record.date,
      isEdited: record.edited ?? false,
      question: q(`demo-q-${record.date.slice(5).replace('-', '')}`, 'PRIMARY', record.question),
    });
  });
}
