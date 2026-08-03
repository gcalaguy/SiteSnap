import React, { useState, useRef } from "react";
import {
  Modal, View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Platform, ActivityIndicator, NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAcceptTerms, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

const TERMS_CONTENT = `TERMS AND CONDITIONS OF USE

Effective Date: May 3, 2026
Company Name: SiteSnap Inc.

─────────────────────────────────────────

1. ACCEPTANCE OF TERMS

By accessing or using the Site Snap platform ("Service"), you agree to be bound by these Terms and Conditions. If you do not agree, you must not use the Service.

─────────────────────────────────────────

2. DESCRIPTION OF SERVICE

Site Snap provides a cloud-based construction project management platform that includes features such as scheduling, estimating, task management, client communication, and AI-powered insights.

We reserve the right to modify or discontinue any feature at any time without notice.

─────────────────────────────────────────

3. USER RESPONSIBILITIES

You agree to:
• Provide accurate and complete information
• Use the Service only for lawful business purposes
• Not misuse, reverse engineer, or disrupt the platform
• Maintain confidentiality of your login credentials

You are solely responsible for:
• All project data entered into the system
• Compliance with construction laws, regulations, and safety requirements

─────────────────────────────────────────

4. AI & AUTOMATION DISCLAIMER

The Service may provide AI-generated recommendations, estimates, schedules, or insights.

You acknowledge that:
• AI outputs are for informational purposes only
• They may not be accurate, complete, or suitable for your specific project
• You are solely responsible for reviewing and validating all outputs before relying on them

We are not liable for decisions made based on AI-generated content.

─────────────────────────────────────────

5. PAYMENTS & SUBSCRIPTIONS

• The Service is billed on a subscription basis (monthly or annually)
• Fees are non-refundable unless otherwise stated
• We may change pricing with reasonable notice
• Failure to pay may result in suspension or termination of access

─────────────────────────────────────────

6. DATA & PRIVACY

Your use of the Service is also governed by our Privacy Policy.

You retain ownership of your data. However, you grant us a limited license to use, store, and process your data to provide and improve the Service.

─────────────────────────────────────────

7. SERVICE AVAILABILITY

We strive to maintain uptime but do not guarantee uninterrupted access. The Service may be temporarily unavailable due to maintenance or technical issues.

─────────────────────────────────────────

8. LIMITATION OF LIABILITY

To the maximum extent permitted by law:

• We are not liable for:
  – Loss of profits, revenue, or business opportunities
  – Project delays or construction defects
  – Errors in estimates, schedules, or data

• Our total liability shall not exceed the amount paid by you in the past 3 months.

─────────────────────────────────────────

9. INDEMNIFICATION

You agree to indemnify and hold harmless SiteSnap Inc. from any claims, damages, or liabilities arising from:
• Your use of the Service
• Your construction projects
• Violations of these Terms

─────────────────────────────────────────

10. TERMINATION

We may suspend or terminate your account at any time if you violate these Terms.

You may cancel your subscription at any time. No refunds will be issued for unused time unless required by law.

─────────────────────────────────────────

11. GOVERNING LAW

These Terms shall be governed by the laws of the Province of Ontario and the laws of Canada applicable therein.

─────────────────────────────────────────

12. CHANGES TO TERMS

We reserve the right to update these Terms at any time. Continued use of the Service constitutes acceptance of the updated Terms.

─────────────────────────────────────────

13. CONTACT INFORMATION

For questions regarding these Terms, contact:
support@sitesnap.ca`;

interface Props {
  visible: boolean;
}

export function TermsModal({ visible }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const acceptTerms = useAcceptTerms({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      },
    },
  });

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const isAtBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
    if (isAtBottom) setScrolledToBottom(true);
  }

  const canAccept = agreed && !acceptTerms.isPending;
  const topPad = Platform.OS === "web" ? 20 : insets.top + 8;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={[styles.iconBg, { backgroundColor: `${colors.primary}1A` }]}>
            <Feather name="file-text" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>Terms and Conditions</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Scroll to the bottom, then accept to continue
            </Text>
          </View>
        </View>

        {/* Scrollable T&C */}
        <ScrollView
          style={[styles.scroll, { backgroundColor: colors.card, borderColor: colors.border }]}
          contentContainerStyle={{ padding: 16 }}
          onScroll={handleScroll}
          scrollEventThrottle={100}
          showsVerticalScrollIndicator
        >
          <Text style={[styles.termsText, { color: colors.mutedForeground }]}>
            {TERMS_CONTENT}
          </Text>
          <View style={{ height: 32 }} />
        </ScrollView>

        {/* Scroll hint */}
        {!scrolledToBottom && (
          <View style={[styles.hint, { backgroundColor: colors.muted }]}>
            <Feather name="chevrons-down" size={14} color={colors.mutedForeground} />
            <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
              Scroll to the bottom to enable acceptance
            </Text>
          </View>
        )}

        {/* Agree checkbox row */}
        <TouchableOpacity
          style={[styles.agreeRow, { borderColor: colors.border, backgroundColor: colors.card }]}
          onPress={() => scrolledToBottom && setAgreed(!agreed)}
          activeOpacity={scrolledToBottom ? 0.7 : 1}
        >
          <View style={[
            styles.checkbox,
            {
              borderColor: agreed ? colors.primary : colors.border,
              backgroundColor: agreed ? colors.primary : "transparent",
            },
          ]}>
            {agreed && <Feather name="check" size={12} color="#fff" />}
          </View>
          <Text style={[
            styles.agreeText,
            { color: scrolledToBottom ? colors.foreground : colors.mutedForeground },
          ]}>
            I have read and agree to the Site Snap Terms and Conditions
          </Text>
        </TouchableOpacity>

        {/* Accept button */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[
              styles.acceptBtn,
              { backgroundColor: canAccept ? colors.primary : colors.muted },
            ]}
            onPress={() => canAccept && acceptTerms.mutate()}
            activeOpacity={canAccept ? 0.8 : 1}
            disabled={!canAccept}
          >
            {acceptTerms.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[
                styles.acceptBtnText,
                { color: canAccept ? "#fff" : colors.mutedForeground },
              ]}>
                Accept and Continue
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1,
  },
  iconBg: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  scroll: { flex: 1, marginHorizontal: 16, marginTop: 12, borderRadius: 10, borderWidth: 1 },
  termsText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  hint: {
    flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center",
    marginHorizontal: 16, paddingVertical: 8, borderRadius: 8, marginTop: 8,
  },
  hintText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  agreeRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    marginHorizontal: 16, marginTop: 10, padding: 14, borderRadius: 10, borderWidth: 1,
  },
  checkbox: {
    width: 20, height: 20, borderRadius: 4, borderWidth: 2,
    alignItems: "center", justifyContent: "center", marginTop: 1,
  },
  agreeText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  footer: { paddingHorizontal: 16, paddingTop: 12 },
  acceptBtn: {
    borderRadius: 12, paddingVertical: 16, alignItems: "center", justifyContent: "center",
  },
  acceptBtnText: { fontSize: 16, fontFamily: "Inter_700Bold" },
});
