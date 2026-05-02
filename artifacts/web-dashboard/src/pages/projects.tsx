import { useState } from "react";
import { Link } from "wouter";
import { useListProjects, useCreateProject } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { getListProjectsQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Loader2, MapPin, Calendar, Building2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const projectSchema = z.object({
  name: z.string().min(2, "Project name must be at least 2 characters"),
  address: z.string().min(2, "Address is required"),
  city: z.string().min(2, "City is required"),
  province: z.string().min(2, "Province is required"),
  status: z.enum(["planning", "active", "on_hold", "completed", "cancelled"]).default("planning"),
  description: z.string().optional(),
});

export default function Projects() {
  const { data: projects, isLoading } = useListProjects();
  const createProject = useCreateProject();
  const { toast } = useToast();
  
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const form = useForm<z.infer<typeof projectSchema>>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: "",
      address: "",
      city: "",
      province: "",
      status: "planning",
      description: "",
    },
  });

  const filteredProjects = projects?.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.address.toLowerCase().includes(search.toLowerCase()) ||
    p.city.toLowerCase().includes(search.toLowerCase())
  );

  function onSubmit(values: z.infer<typeof projectSchema>) {
    createProject.mutate(
      { data: values },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
          toast({ title: "Project created successfully" });
          setIsDialogOpen(false);
          form.reset();
        },
        onError: (err: any) => {
          toast({
            title: "Failed to create project",
            description: err?.message || "An error occurred",
            variant: "destructive",
          });
        },
      }
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active": return <Badge variant="default" className="bg-green-600">Active</Badge>;
      case "planning": return <Badge variant="secondary">Planning</Badge>;
      case "on_hold": return <Badge variant="outline" className="text-orange-600 border-orange-600">On Hold</Badge>;
      case "completed": return <Badge variant="default" className="bg-blue-600">Completed</Badge>;
      case "cancelled": return <Badge variant="destructive">Cancelled</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">Manage all your job sites in one place.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Project Name</FormLabel><FormControl><Input placeholder="123 Main St Reno" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="address" render={({ field }) => (
                  <FormItem><FormLabel>Street Address</FormLabel><FormControl><Input placeholder="123 Main St" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="city" render={({ field }) => (
                    <FormItem><FormLabel>City</FormLabel><FormControl><Input placeholder="Toronto" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="province" render={({ field }) => (
                    <FormItem><FormLabel>Province</FormLabel><FormControl><Input placeholder="ON" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="status" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="planning">Planning</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="on_hold">On Hold</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <DialogFooter>
                  <Button type="submit" disabled={createProject.isPending}>
                    {createProject.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Project
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search projects by name, city, or address..."
          className="pl-9 max-w-md"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground animate-pulse">Loading projects...</div>
      ) : filteredProjects?.length === 0 ? (
        <Card className="p-8 text-center bg-muted/20">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
            <Building2 className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">No projects found</h3>
          <p className="text-muted-foreground mb-4">Get started by creating your first project.</p>
          <Button variant="outline" onClick={() => setIsDialogOpen(true)}>Create Project</Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects?.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg line-clamp-1" title={project.name}>{project.name}</CardTitle>
                    {getStatusBadge(project.status)}
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-between">
                  <div className="space-y-2 mt-2">
                    <div className="flex items-start text-sm text-muted-foreground">
                      <MapPin className="mr-2 h-4 w-4 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{project.address}, {project.city}, {project.province}</span>
                    </div>
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Calendar className="mr-2 h-4 w-4 shrink-0" />
                      <span>Added {format(new Date(project.createdAt), "MMM d, yyyy")}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
