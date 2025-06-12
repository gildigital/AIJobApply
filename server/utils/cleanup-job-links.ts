import { Pool } from 'pg';

// Utility: extract slug from a Workable URL
function extractSlug(url: string): string {
  const parts = url.split('/view/');
  if (parts.length < 2) return '';
  const rest = parts[1];
  return rest.slice(rest.indexOf('/') + 1);
}

// Utility: Jaccard similarity on word tokens
function jaccard(a: string, b: string): number {
  const tokens = (s: string) =>
    new Set(
      s.toLowerCase()
        .split(/[\W_]+/)
        .filter(t => t.length > 2)
    );
  const A = tokens(a);
  const B = tokens(b);
  const intersection = [...A].filter(x => B.has(x)).length;
  const union = A.size + B.size - intersection;
  return union > 0 ? intersection / union : 0;
}

// Simple Union-Find for clustering
class UnionFind {
  private parent = new Map<number, number>();
  find(x: number): number {
    if (!this.parent.has(x)) this.parent.set(x, x);
    const p = this.parent.get(x)!;
    if (p !== x) this.parent.set(x, this.find(p));
    return this.parent.get(x)!;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export async function cleanupJobLinks(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // 1) Fetch all IDs & URLs
    const { rows } = await pool.query<{ id: number; url: string }>(
      'SELECT id, url FROM job_links'
    );

    // 2) Build id->slug and inverted index
    const idToSlug = new Map<number, string>();
    const tokenIndex = new Map<string, Set<number>>();

    rows.forEach(({ id, url }) => {
      const slug = extractSlug(url);
      idToSlug.set(id, slug);
      new Set(slug.split(/[\W_]+/).filter(w => w.length > 2))
        .forEach(token => {
          if (!tokenIndex.has(token)) tokenIndex.set(token, new Set());
          tokenIndex.get(token)!.add(id);
        });
    });

    // 3) Generate candidate pairs
    const seen = new Set<string>();
    const pairs: [number, number][] = [];
    idToSlug.forEach((slug, id) => {
      const tokens = new Set(slug.split(/[\W_]+/).filter(w => w.length > 2));
      const candidates = new Set<number>();
      tokens.forEach(t => tokenIndex.get(t)?.forEach(other => {
        if (other !== id) candidates.add(other);
      }));
      candidates.forEach(other => {
        const key = id < other ? `${id}-${other}` : `${other}-${id}`;
        if (!seen.has(key)) {
          seen.add(key);
          pairs.push([id, other]);
        }
      });
    });

    // 4) Cluster via Jaccard
    const uf = new UnionFind();
    const THRESHOLD = 0.8;
    pairs.forEach(([a, b]) => {
      if (jaccard(idToSlug.get(a)!, idToSlug.get(b)!) >= THRESHOLD) {
        uf.union(a, b);
      }
    });

    // 5) Collect clusters and IDs to demote
    const clusters = new Map<number, number[]>();
    idToSlug.forEach((_, id) => {
      const root = uf.find(id);
      const arr = clusters.get(root) || [];
      arr.push(id);
      clusters.set(root, arr);
    });

    const toDemote: number[] = [];
    clusters.forEach(group => {
      if (group.length > 1) {
        group.sort((a, b) => a - b);
        toDemote.push(...group.slice(1));
      }
    });

    if (toDemote.length === 0) {
      console.log('No duplicates found to demote.');
      return;
    }

    // 6) Bulk update priorities
    const updateRes = await pool.query(
      'UPDATE job_links SET priority = 0 WHERE id = ANY($1::int[])',
      [toDemote]
    );

    console.log(`✅ Demoted ${updateRes.rowCount} job_links to priority=0`);
  } catch (err) {
    console.error('Error in cleanupJobLinks:', err);
  } finally {
    await pool.end();
  }
}

// If run directly, invoke cleanup
if (process.argv[1] === import.meta.url) {
  cleanupJobLinks().then(() => process.exit(0));
}
