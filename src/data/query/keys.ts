import type { ExcerptProfile } from '../../domain/models.ts';

export const queryKeys = {
  owner: (ownerScope: string) => ['arca', ownerScope] as const,
  today: (ownerScope: string, generation: string, excerptProfile: ExcerptProfile) =>
    ['arca', ownerScope, generation, 'today', excerptProfile] as const,
  passenger: (ownerScope: string, generation: string) => ['arca', ownerScope, generation, 'passenger'] as const,
  answers: (ownerScope: string, generation: string, excerptProfile: ExcerptProfile) =>
    ['arca', ownerScope, generation, 'answers', excerptProfile] as const,
  answer: (ownerScope: string, generation: string, answerId: string) =>
    ['arca', ownerScope, generation, 'answer', answerId] as const,
};
