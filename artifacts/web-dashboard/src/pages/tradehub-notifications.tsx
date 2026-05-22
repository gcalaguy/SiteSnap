import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTradehubNotifications,
  useMarkAllTradehubNotificationsRead,
  getListTradehubNotificationsQueryKey,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { ArrowLeft, Bell, CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function TradehubNotificationsPage() {
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useListTradehubNotifications();

  const markReadMutation = useMarkAllTradehubNotificationsRead({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTradehubNotificationsQueryKey() }),
    },
  });

  const allNotifs = notifications as any[];
  const unread = allNotifs.filter((n) => !n.isRead);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/tradehub">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex items-center gap-3 flex-1">
          <div className="p-2 bg-primary/10 rounded-xl">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Notifications</h1>
            <p className="text-sm text-muted-foreground">
              {unread.length > 0 ? `${unread.length} unread` : "All caught up"}
            </p>
          </div>
        </div>
        {unread.length > 0 && (
          <Button variant="outline" size="sm" className="gap-2" onClick={() => markReadMutation.mutate()} disabled={markReadMutation.isPending}>
            {markReadMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
            Mark all read
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : allNotifs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
              <Bell className="h-10 w-10 text-muted-foreground/30" />
              <p className="font-medium text-muted-foreground">No notifications yet</p>
              <p className="text-sm text-muted-foreground">You'll be notified when someone comments on or likes your posts.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {allNotifs.map((n: any, i: number) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-4 p-4 transition-colors ${n.isRead ? "" : "bg-primary/5"} ${i === 0 ? "rounded-t-xl" : ""} ${i === allNotifs.length - 1 ? "rounded-b-xl" : ""}`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${n.isRead ? "bg-muted" : "bg-primary/10"}`}>
                    <Bell className={`h-4 w-4 ${n.isRead ? "text-muted-foreground" : "text-primary"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${n.isRead ? "text-muted-foreground" : "text-foreground font-medium"}`}>{n.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">{format(new Date(n.createdAt), "MMM d, yyyy · h:mm a")}</p>
                  </div>
                  {n.referenceId && (
                    <Link href={`/tradehub/posts/${n.referenceId}`}>
                      <Button variant="ghost" size="sm" className="text-xs flex-shrink-0">View</Button>
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
