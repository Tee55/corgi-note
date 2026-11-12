import { z } from "zod";
export const activities = [
  "Walk",
  "Play",
  "Training",
  "Rest",
  "Health",
  "Other",
] as const;
export const moods = ["Happy", "Playful", "Sleepy", "Calm"] as const;
export const maxPhotoBytes = 3 * 1024 * 1024;
export const photoSchema = z.object({
  key: z.string().max(180),
  alt: z.string().trim().min(1, "Describe this photo.").max(200),
});
export const entrySchema = z.object({
  dogName: z.string().trim().min(1, "Enter your dog’s name.").max(40),
  date: z.iso.date(),
  title: z.string().trim().min(1, "Give this memory a title.").max(100),
  activity: z.enum(activities),
  mood: z.enum(moods),
  body: z.string().trim().min(1, "Write a little about this day.").max(5000),
  photos: z.array(photoSchema).max(4),
  revision: z.number().int().min(0),
});
export type EntryInput = z.infer<typeof entrySchema>;
export type Photo = z.infer<typeof photoSchema> & { url?: string };
export type Entry = Omit<EntryInput, "photos"> & {
  id: string;
  photos: Photo[];
  createdAt: string;
  updatedAt: string;
};
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
