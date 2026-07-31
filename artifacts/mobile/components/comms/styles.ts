import { StyleSheet } from "react-native";

/** Shared styles for the Phase 4 Communications Hub sub-tab panels — mirrors
 * the emptyBox/retryBtn/row conventions already established in
 * CommunicationsTab.tsx / uncategorized-emails.tsx so new tabs feel consistent. */
export const commsStyles = StyleSheet.create({
  emptyBox: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 8,
    borderWidth: 1,
    borderRadius: 16,
    borderStyle: "dashed",
  },
  emptyTitle: { fontSize: 13, fontFamily: "NunitoSans_600SemiBold" },
  emptySubText: {
    fontSize: 12,
    fontFamily: "NunitoSans_400Regular",
    textAlign: "center",
    paddingHorizontal: 24,
    lineHeight: 17,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 4,
  },
  retryText: { fontSize: 13, fontFamily: "NunitoSans_500Medium" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { fontSize: 14, fontFamily: "NunitoSans_600SemiBold" },
  rowMeta: { fontSize: 12, fontFamily: "NunitoSans_400Regular", marginTop: 1 },
  rowDate: { fontSize: 11, fontFamily: "NunitoSans_400Regular" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 10, fontFamily: "NunitoSans_600SemiBold" },
});
