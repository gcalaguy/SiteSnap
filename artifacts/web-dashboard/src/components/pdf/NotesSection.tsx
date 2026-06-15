import { View, Text } from "@react-pdf/renderer";
import { styles } from "./theme";
import { format } from "date-fns";

interface Note {
  id: number;
  content: string;
  createdAt: string;
  author?: {
    firstName?: string | null;
    lastName?: string | null;
  } | null;
}

interface NotesSectionProps {
  notes: Note[];
}

export default function NotesSection({ notes }: NotesSectionProps) {
  if (!notes || notes.length === 0) {
    return (
      <View>
        <Text style={styles.sectionTitle}>Project Notes</Text>
        <View style={styles.sectionDivider} />
        <Text style={styles.emptyState}>No notes recorded for this project.</Text>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.sectionTitle}>Project Notes</Text>
      <View style={styles.sectionDivider} />
      {notes.map((note) => (
        <View key={note.id} style={styles.card}>
          <Text style={styles.text}>{note.content}</Text>
          <Text style={[styles.tinyText, { marginTop: 4 }]}>
            {note.author
              ? `${note.author.firstName ?? ""} ${note.author.lastName ?? ""}`.trim() || "Unknown"
              : "Unknown"}
            {" · "}
            {format(new Date(note.createdAt), "MMM d, yyyy h:mm a")}
          </Text>
        </View>
      ))}
    </View>
  );
}
