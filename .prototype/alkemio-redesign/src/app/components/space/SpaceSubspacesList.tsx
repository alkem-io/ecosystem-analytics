import { useState } from "react";
import { Link, useParams } from "react-router";
import { Plus, Users, Clock, ArrowRight, Folder } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/app/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/app/components/ui/avatar";
import { Badge } from "@/app/components/ui/badge";
import { cn } from "@/lib/utils";

// Mock Data
const SUBSPACES = [
  {
    id: 1,
    name: "Renewable Energy Transition",
    description: "Developing strategies for municipal energy transition to 100% renewables by 2030.",
    image: "https://images.unsplash.com/photo-1677506048377-1099738d294d?auto=format&fit=crop&w=800&q=80",
    memberCount: 24,
    lastActive: "2 hours ago",
    status: "Active",
    role: "Member",
    leads: [
      { name: "Sarah Chen", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80", type: "person" },
      { name: "Green Future Org", avatar: "https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?ixlib=rb-1.2.1&auto=format&fit=crop&w=256&q=80", type: "org" }
    ]
  },
  {
    id: 2,
    name: "Urban Mobility Lab",
    description: "Reimagining city transportation networks for better accessibility and reduced carbon footprint.",
    image: "https://images.unsplash.com/photo-1743385779313-ac03bb0f997b?auto=format&fit=crop&w=800&q=80",
    memberCount: 18,
    lastActive: "1 day ago",
    status: "Active",
    role: "Facilitator",
    leads: [
      { name: "David Kim", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80", type: "person" }
    ]
  },
  {
    id: 3,
    name: "Green Infrastructure",
    description: "Planning and implementation of urban green spaces, vertical gardens, and sustainable drainage.",
    image: "https://images.unsplash.com/photo-1760611656007-f767a8082758?auto=format&fit=crop&w=800&q=80",
    memberCount: 12,
    lastActive: "3 days ago",
    status: "Active",
    role: "Member",
    leads: [
      { name: "Emily Davis", avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80", type: "person" },
      { name: "City Planning Dept", avatar: "https://images.unsplash.com/photo-1517048676732-d65bc937f952?ixlib=rb-1.2.1&auto=format&fit=crop&w=256&q=80", type: "org" },
      { name: "James Wilson", avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80", type: "person" }
    ]
  },
  {
    id: 4,
    name: "Policy Frameworks",
    description: "Drafting policy recommendations and regulatory frameworks to support sustainability initiatives.",
    image: "https://images.unsplash.com/photo-1769069918751-9cdb7c752fcc?auto=format&fit=crop&w=800&q=80",
    memberCount: 8,
    lastActive: "5 days ago",
    status: "Archived",
    role: "Observer",
    leads: [
       { name: "Policy Institute", avatar: "https://images.unsplash.com/photo-1552664730-d307ca884978?ixlib=rb-1.2.1&auto=format&fit=crop&w=256&q=80", type: "org" }
    ]
  },
  {
    id: 5,
    name: "Community Engagement",
    description: "Tools and methodologies for involving local communities in decision-making processes.",
    image: "https://images.unsplash.com/photo-1554103210-26d928978fb5?auto=format&fit=crop&w=800&q=80",
    memberCount: 32,
    lastActive: "Just now",
    status: "Active",
    role: "Member",
    leads: [
      { name: "Anna Martinez", avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80", type: "person" },
      { name: "Local Council", avatar: "https://images.unsplash.com/photo-1560179707-f14e90ef3623?ixlib=rb-1.2.1&auto=format&fit=crop&w=256&q=80", type: "org" }
    ]
  },
  {
    id: 6,
    name: "Digital Twin Project",
    description: "Creating digital replicas of urban systems to simulate and optimize performance.",
    image: "https://images.unsplash.com/photo-1683818051102-dd1199d163b9?auto=format&fit=crop&w=800&q=80",
    memberCount: 15,
    lastActive: "1 week ago",
    status: "Active",
    role: "Member",
    leads: [
      { name: "Tech Innovations", avatar: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?ixlib=rb-1.2.1&auto=format&fit=crop&w=256&q=80", type: "org" },
      { name: "Robert Fox", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80", type: "person" }
    ]
  }
];

export function SpaceSubspacesList() {
  const { spaceSlug } = useParams<{ spaceSlug: string }>();
  const slug = spaceSlug || "default-space";
  const [filter, setFilter] = useState("All");

  const filteredSubspaces = filter === "All" 
    ? SUBSPACES 
    : SUBSPACES.filter(s => s.status === filter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Subspaces</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Explore focused workstreams and challenges within this space.
          </p>
        </div>
        <Button className="shrink-0">
          <Plus className="w-4 h-4 mr-2" />
          Create Subspace
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        {["All", "Active", "Archived"].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium transition-colors border",
              filter === status
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground"
            )}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredSubspaces.map((subspace) => (
          <Link 
            key={subspace.id} 
            to={`/${slug}/challenges/${subspace.name.toLowerCase().replace(/\s+/g, '-')}`}
            className="group block h-full"
          >
            <Card className="h-full overflow-hidden hover:shadow-lg transition-all duration-300 border-border group-hover:border-primary/50 flex flex-col">
              <div className="relative aspect-video overflow-hidden bg-muted">
                <img 
                  src={subspace.image} 
                  alt={subspace.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-60" />
                <div className="absolute bottom-3 left-3 right-3 flex justify-between items-end">
                  <Badge variant="secondary" className="bg-background/90 text-foreground backdrop-blur-sm border-0 font-medium text-xs">
                    {subspace.status}
                  </Badge>
                  
                  {/* Leads Avatars */}
                  {subspace.leads && (
                    <div className="flex -space-x-2 items-end">
                      {subspace.leads.map((lead, i) => (
                        <Avatar key={i} className="w-8 h-8 border-2 border-background ring-2 ring-background/20" title={`${lead.name} (${lead.type})`}>
                          <AvatarImage src={lead.avatar} alt={lead.name} />
                          <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                            {lead.name.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              <CardHeader className="p-4 pb-2">
                <h3 className="font-semibold text-lg leading-tight group-hover:text-primary transition-colors">
                  {subspace.name}
                </h3>
              </CardHeader>
              
              <CardContent className="p-4 pt-2 flex-grow">
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {subspace.description}
                </p>
              </CardContent>
              
              <CardFooter className="p-4 border-t bg-muted/30 text-xs text-muted-foreground flex justify-between items-center mt-auto">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1" title="Members">
                    <Users className="w-3.5 h-3.5" />
                    <span>{subspace.memberCount}</span>
                  </div>
                  <div className="flex items-center gap-1" title="Last active">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{subspace.lastActive}</span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-primary" />
              </CardFooter>
            </Card>
          </Link>
        ))}
      </div>
      
      {filteredSubspaces.length === 0 && (
        <div className="text-center py-16 border rounded-lg bg-muted/10 border-dashed">
          <Folder className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
          <h3 className="text-lg font-medium">No subspaces found</h3>
          <p className="text-muted-foreground text-sm">No subspaces match your current filter.</p>
          <Button 
            variant="link" 
            onClick={() => setFilter("All")}
            className="mt-2"
          >
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}
