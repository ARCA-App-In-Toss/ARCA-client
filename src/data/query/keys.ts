import type { ExcerptProfile } from '../api/models.ts';

// Private query keys always carry ownerScope and generation (06 §6.1). Screens never assemble keys.
export const queryKeys = {
  owner: (ownerScope: string) => ['arca', ownerScope] as const,
  today: (ownerScope: string, generation: string, excerptProfile: ExcerptProfile) =>
    ['arca', ownerScope, generation, 'today', excerptProfile] as const,
  answers: (ownerScope: string, generation: string, excerptProfile: ExcerptProfile) =>
    ['arca', ownerScope, generation, 'answers', excerptProfile] as const,
  answer: (ownerScope: string, generation: string, answerId: string) =>
    ['arca', ownerScope, generation, 'answer', answerId] as const,
};
