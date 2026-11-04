import type { GuestPlayerFactory, PlayerCatalogRepository, RulebookRepository, WeeklyFormRepository } from '../data/catalog.js';
import type { DraftRepository, MatchRepository } from '../data/persistence.js';
import type { LineupOptimizer, LineupService, MatchSnapshotFactory, SelectionService, SimulationGateway } from './services.js';

/** Composition root will inject these adapters; features do not open databases. */
export interface ApplicationPorts {
  readonly catalogs: PlayerCatalogRepository;
  readonly rulebooks: RulebookRepository;
  readonly forms: WeeklyFormRepository;
  readonly drafts: DraftRepository;
  readonly matches: MatchRepository;
  readonly guests: GuestPlayerFactory;
  readonly selection: SelectionService;
  readonly lineups: LineupService;
  readonly optimizer: LineupOptimizer;
  readonly matchSnapshots: MatchSnapshotFactory;
  readonly simulation: SimulationGateway;
}
