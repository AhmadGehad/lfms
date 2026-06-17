import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export default function UserManagement() {
  const { t } = useTranslation();
  const { data: users, isLoading } = trpc.userMgmt.listUsers.useQuery();
  const utils = trpc.useUtils();

  const updateRole = trpc.userMgmt.updateUserRole.useMutation({
    onSuccess: () => { toast.success(t("users.roleUpdated")); utils.userMgmt.listUsers.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const roleOptions = [
    { value: "viewer", label: t("users.viewer") },
    { value: "user", label: t("users.user") },
    { value: "staff", label: t("users.staff") },
    { value: "supervisor", label: t("users.supervisor") },
    { value: "admin", label: t("users.admin") },
    { value: "owner", label: t("users.owner") },
  ];

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          {t("users.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("users.subtitle")}
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("users.email")}</TableHead>
                  <TableHead>{t("users.role")}</TableHead>
                  <TableHead>{t("users.lastSignIn")}</TableHead>
                  <TableHead>{t("users.joined")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8">{t("common.loading")}</TableCell></TableRow>
                ) : (users ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">{t("users.noUsers")}</TableCell></TableRow>
                ) : (
                  (users ?? []).map((u: any) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{u.email ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={u.role === "admin" || u.role === "owner" ? "default" : "secondary"} className="capitalize">
                          {roleOptions.find(r => r.value === u.role)?.label || u.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Select
                          value={u.role}
                          onValueChange={(role) => updateRole.mutate({ userId: u.id, role: role as any })}
                          disabled={updateRole.isPending}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {roleOptions.map(option => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
