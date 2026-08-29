import { useLocation } from "wouter";
import { useGetMe, useListAiSkills } from "@workspace/api-client-react";
import { FileText, Loader2, Lock, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const GOLD = "#C9A84C";
const BLACK = "#111111";

export default function AiSkillsPage() {
  const [, setLocation] = useLocation();
  const { data: me } = useGetMe();
  const { data: skills = [], isLoading } = useListAiSkills();
  const canGenerate = me?.role === "owner" || me?.role === "foreman" || (me?.permissions as any)?.useAiSkills === true;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ background: BLACK }}>
          <Sparkles className="h-5 w-5" style={{ color: GOLD }} />
        </div>
        <div>
          <h1 className="text-xl font-semibold">AI Document Skills</h1>
          <p className="text-sm text-muted-foreground">
            Draft RFIs, daily reports, punch lists, safety writeups and more from your field notes.
          </p>
        </div>
      </div>

      {!canGenerate && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Lock className="h-3 w-3" /> You can view drafts for your assigned projects, but generating new drafts requires owner/foreman access.
        </p>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {skills.map((skill) => (
            <Card
              key={skill.key}
              className="cursor-pointer transition-colors hover:border-[#C9A84C]/60"
              onClick={() => setLocation(`/ai-skills/${skill.key}`)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4 flex-shrink-0" style={{ color: GOLD }} />
                    {skill.name}
                  </CardTitle>
                  {skill.requiresApproval && (
                    <Badge variant="outline" className="text-[10px] flex-shrink-0">Needs approval</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-xs leading-relaxed">{skill.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
