import { Router, type IRouter } from "express";
import { db, projectsTable } from "@workspace/db";
import { eq, ilike, and, desc, or } from "drizzle-orm";

const router: IRouter = Router();

function formatProject(p: typeof projectsTable.$inferSelect) {
  return {
    id: p.id,
    name: p.name,
    logo: p.logo,
    tagline: p.tagline,
    chain: p.chain,
    tags: p.tags,
    website: p.website,
    twitter: p.twitter,
    ownerWallet: p.ownerWallet,
    isPinned: p.isPinned,
    pinnedUntil: p.pinnedUntil?.toISOString() ?? null,
    status: p.status,
    latestPostTitle: p.latestPostTitle,
    latestPostAt: p.latestPostAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/pinned", async (_req, res) => {
  const now = new Date();
  const pinned = await db.select().from(projectsTable)
    .where(and(eq(projectsTable.isPinned, true), eq(projectsTable.status, "active")))
    .orderBy(desc(projectsTable.createdAt))
    .limit(10);
  res.json(pinned.map(formatProject));
});

router.get("/", async (req, res) => {
  const search = req.query.search as string | undefined;
  const page = Math.max(1, parseInt(req.query.page as string ?? "1"));
  const limit = Math.min(50, parseInt(req.query.limit as string ?? "20"));
  const offset = (page - 1) * limit;

  let query = db.select().from(projectsTable).where(
    and(
      eq(projectsTable.status, "active"),
      eq(projectsTable.isPinned, false),
      search ? or(ilike(projectsTable.name, `%${search}%`), ilike(projectsTable.tagline, `%${search}%`)) : undefined
    )
  );

  const all = await db.select().from(projectsTable).where(
    and(
      eq(projectsTable.status, "active"),
      eq(projectsTable.isPinned, false),
      search ? or(ilike(projectsTable.name, `%${search}%`), ilike(projectsTable.tagline, `%${search}%`)) : undefined
    )
  );

  const projects = await db.select().from(projectsTable)
    .where(and(
      eq(projectsTable.status, "active"),
      eq(projectsTable.isPinned, false),
      search ? or(ilike(projectsTable.name, `%${search}%`), ilike(projectsTable.tagline, `%${search}%`)) : undefined
    ))
    .orderBy(desc(projectsTable.latestPostAt), desc(projectsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({
    projects: projects.map(formatProject),
    total: all.length,
    page,
    totalPages: Math.ceil(all.length / limit),
  });
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const projects = await db.select().from(projectsTable).where(eq(projectsTable.id, id)).limit(1);
  if (projects.length === 0) return res.status(404).json({ error: "Project not found" });

  res.json(formatProject(projects[0]));
});

router.post("/", async (req, res) => {
  const { name, logo, tagline, chain, tags, website, twitter, ownerWallet } = req.body;
  if (!name || !ownerWallet) return res.status(400).json({ error: "name and ownerWallet required" });

  const inserted = await db.insert(projectsTable).values({
    name,
    logo: logo ?? null,
    tagline: tagline ?? null,
    chain: chain ?? null,
    tags: tags ?? null,
    website: website ?? null,
    twitter: twitter ?? null,
    ownerWallet: ownerWallet.toLowerCase(),
    isPinned: false,
    status: "pending",
  }).returning();

  res.status(201).json(formatProject(inserted[0]));
});

export default router;
