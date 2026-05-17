import { StyleSheet } from "@react-pdf/renderer";

export const COLORS = {
  gold: "#D4AF37",
  goldDark: "#b5922e",
  darkText: "#1a1a1a",
  lightText: "#666666",
  mutedText: "#999999",
  border: "#e5e5e5",
  lightBg: "#f8f8f8",
  white: "#ffffff",
  red: "#dc2626",
  green: "#16a34a",
  orange: "#d97706",
  blue: "#2563eb",
  amber: "#f59e0b",
};

export const FONTS = {
  body: "Helvetica",
  bold: "Helvetica-Bold",
  oblique: "Helvetica-Oblique",
};

export const SIZES = {
  pagePadding: 40,
  sectionGap: 16,
  heading: 18,
  subheading: 14,
  body: 10,
  small: 9,
  tiny: 8,
};

export const styles = StyleSheet.create({
  page: {
    padding: SIZES.pagePadding,
    fontFamily: FONTS.body,
    fontSize: SIZES.body,
    color: COLORS.darkText,
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.gold,
    paddingBottom: 12,
    marginBottom: 20,
  },
  headerTitle: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: COLORS.darkText,
  },
  headerSubtitle: {
    fontSize: SIZES.small,
    color: COLORS.lightText,
    marginTop: 4,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: SIZES.pagePadding,
    right: SIZES.pagePadding,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: SIZES.tiny,
    color: COLORS.mutedText,
  },
  sectionTitle: {
    fontFamily: FONTS.bold,
    fontSize: SIZES.heading,
    color: COLORS.gold,
    marginBottom: 10,
    marginTop: 6,
  },
  sectionDivider: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 12,
    marginTop: 4,
  },
  card: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 4,
    padding: 10,
    marginBottom: 8,
  },
  cardTitle: {
    fontFamily: FONTS.bold,
    fontSize: SIZES.subheading,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: SIZES.small,
    color: COLORS.lightText,
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  label: {
    fontSize: SIZES.small,
    color: COLORS.lightText,
  },
  value: {
    fontSize: SIZES.small,
    color: COLORS.darkText,
    fontFamily: FONTS.bold,
  },
  text: {
    fontSize: SIZES.body,
    lineHeight: 1.4,
  },
  smallText: {
    fontSize: SIZES.small,
    color: COLORS.lightText,
    lineHeight: 1.3,
  },
  tinyText: {
    fontSize: SIZES.tiny,
    color: COLORS.mutedText,
  },
  badge: {
    fontSize: SIZES.tiny,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    fontFamily: FONTS.bold,
  },
  grid2: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  gridItem: {
    width: "48%",
  },
  image: {
    width: 60,
    height: 60,
    borderRadius: 3,
    marginRight: 6,
    marginBottom: 6,
  },
  emptyState: {
    fontSize: SIZES.small,
    color: COLORS.mutedText,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 12,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 4,
    marginBottom: 4,
    fontFamily: FONTS.bold,
    fontSize: SIZES.small,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
  },
  tableCell: {
    fontSize: SIZES.small,
    color: COLORS.darkText,
  },
});
