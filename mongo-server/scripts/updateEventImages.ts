import { MongoClient, WithId, Document } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error('MONGODB_URI is not defined. Update src/.env with your connection string.');
}

type Replacement = {
  test: (title: string) => boolean;
  url: string;
  description?: string;
};

const replacements: Replacement[] = [
  {
    test: (title) => /intro\s+to\s+mongodb/i.test(title),
    url: 'https://res.cloudinary.com/docvjnnth/image/upload/v1760423707/workshop_u0eixr.jpg',
    description: 'Workshop attendees raising their hands during training',
  },
  {
    test: (title) => /advanced\s+mongodb/i.test(title),
    url: 'https://res.cloudinary.com/docvjnnth/image/upload/v1760423706/seminar_a1cme1.jpg',
    description: 'Seminar audience listening to a presentation',
  },
  {
    test: (title) => /real\s+world\s+mongodb/i.test(title),
    url: 'https://res.cloudinary.com/docvjnnth/image/upload/v1760423706/townhall_zb6hjl.jpg',
    description: 'Town hall speaker presenting to a crowd',
  },
];

const needsUpdate = (doc: WithId<Document>): boolean => {
  const raw = String(doc.eventImageUrl ?? '');
  if (!raw.trim()) return true;
  return raw.trim().startsWith('/images/');
};

async function run(): Promise<void> {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();
    const events = db.collection('events');

    const rows = await events.find({}).toArray();
    let updated = 0;

    for (const row of rows) {
      const title = String(row.title ?? '');
      if (!title) continue;
      const replacement = replacements.find((entry) => entry.test(title));
      if (!replacement) continue;
      if (!needsUpdate(row)) continue;

      await events.updateOne(
        { _id: row._id },
        {
          $set: {
            eventImageUrl: replacement.url,
            eventImageDescription: replacement.description ?? '',
          },
        }
      );
      updated += 1;
      console.log(`Updated event '${title}' -> ${replacement.url}`);
    }

    if (updated === 0) {
      console.log('No events needed image updates.');
    } else {
      console.log(`Event image update complete. ${updated} document(s) modified.`);
    }
  } finally {
    await client.close();
  }
}

run().catch((err) => {
  console.error('Failed to update event images:', err);
  process.exit(1);
});

