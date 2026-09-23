// Local development only: `pnpm --filter api exec prisma db seed`.
import { PrismaClient, type Prisma } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { SceneSchema, emptyScene, type Scene } from "@whiteboard/shared";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed a production database.");
  process.exit(1);
}

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "demo-password";

const scene: Scene = SceneSchema.parse({
  ...emptyScene(),
  shapes: {
    "rect-1": {
      id: "rect-1",
      type: "rect",
      x: 100,
      y: 100,
      width: 160,
      height: 100,
      rotation: 0,
      style: { fill: "#60a5fa", stroke: "#1d4ed8", strokeWidth: 0, opacity: 1 },
    },
  },
  order: ["rect-1"],
});

const prisma = new PrismaClient();

try {
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: { email: DEMO_EMAIL, name: "Demo User", passwordHash: await hash(DEMO_PASSWORD) },
  });
  if ((await prisma.board.count({ where: { ownerId: user.id } })) === 0) {
    await prisma.board.create({
      data: {
        ownerId: user.id,
        title: "Demo board",
        scene: scene as unknown as Prisma.InputJsonValue,
      },
    });
  }
  console.log(`Seeded ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
} finally {
  await prisma.$disconnect();
}
