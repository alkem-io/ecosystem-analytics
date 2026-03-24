import { useState } from "react";
import { 
  FileText, Link as LinkIcon, Image as ImageIcon, FileSpreadsheet, 
  MoreHorizontal, Download, ExternalLink, Search, Filter, 
  FolderOpen, Clock, User, File
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/app/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import { Badge } from "@/app/components/ui/badge";
import { cn } from "@/lib/utils";

// Mock Data
const RESOURCES = [
  {
    id: 1,
    name: "Q1 Sustainability Report",
    type: "pdf",
    category: "Reports",
    size: "2.4 MB",
    uploadedBy: "Alex Contributor",
    date: "2024-03-15",
    url: "#"
  },
  {
    id: 2,
    name: "Project Roadmap 2024",
    type: "spreadsheet",
    category: "Planning",
    size: "45 KB",
    uploadedBy: "Sarah Chen",
    date: "2024-03-10",
    url: "#"
  },
  {
    id: 3,
    name: "Community Workshop Guidelines",
    type: "doc",
    category: "Guidelines",
    size: "850 KB",
    uploadedBy: "James Wilson",
    date: "2024-02-28",
    url: "#"
  },
  {
    id: 4,
    name: "Urban Design Inspiration Board",
    type: "link",
    category: "Design",
    size: "-",
    uploadedBy: "Elena Rodriguez",
    date: "2024-02-15",
    url: "https://miro.com/app/board/..."
  },
  {
    id: 5,
    name: "Site Survey Photos",
    type: "image",
    category: "Assets",
    size: "15.2 MB",
    uploadedBy: "Michael Chang",
    date: "2024-02-10",
    url: "#"
  },
  {
    id: 6,
    name: "Stakeholder Meeting Notes",
    type: "doc",
    category: "Meeting Notes",
    size: "120 KB",
    uploadedBy: "Alex Contributor",
    date: "2024-01-22",
    url: "#"
  }
];

const CATEGORIES = ["All", "Reports", "Planning", "Guidelines", "Design", "Assets", "Meeting Notes"];

export function SpaceResourcesList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const filteredResources = RESOURCES.filter((resource) => {
    const matchesSearch = resource.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "All" || resource.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getFileIcon = (type: string) => {
    switch (type) {
      case "pdf": return <FileText className="text-red-500" />;
      case "spreadsheet": return <FileSpreadsheet className="text-green-600" />;
      case "doc": return <FileText className="text-blue-600" />;
      case "link": return <LinkIcon className="text-purple-500" />;
      case "image": return <ImageIcon className="text-orange-500" />;
      default: return <File className="text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Knowledge Base</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Access shared documents, reports, and resources for this space.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <FolderOpen className="w-4 h-4 mr-2" />
            New Folder
          </Button>
          <Button>
            <Download className="w-4 h-4 mr-2" />
            Upload File
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-card p-4 rounded-lg border shadow-sm">
        <div className="w-full md:w-72 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search resources..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-background"
          />
        </div>
        
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          {CATEGORIES.slice(0, 4).map(category => (
            <Badge 
              key={category}
              variant={selectedCategory === category ? "default" : "outline"}
              className="cursor-pointer hover:bg-primary/90 hover:text-primary-foreground transition-colors px-3 py-1.5"
              onClick={() => setSelectedCategory(category)}
            >
              {category}
            </Badge>
          ))}
          {CATEGORIES.length > 4 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 rounded-full px-3 text-xs border-dashed">
                  <Filter className="w-3 h-3 mr-1" />
                  More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {CATEGORIES.slice(4).map(category => (
                  <DropdownMenuItem key={category} onClick={() => setSelectedCategory(category)}>
                    {category}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Resources Table */}
      <div className="rounded-md border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-[40%]">Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Uploaded By</TableHead>
              <TableHead className="hidden md:table-cell">Date</TableHead>
              <TableHead className="text-right">Size</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredResources.map((resource) => (
              <TableRow key={resource.id} className="group hover:bg-muted/30 transition-colors">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-muted/50 rounded-md group-hover:bg-background group-hover:shadow-sm transition-all">
                      <div className="w-5 h-5 [&>svg]:w-full [&>svg]:h-full">
                        {getFileIcon(resource.type)}
                      </div>
                    </div>
                    <div>
                      <span className="font-medium text-foreground block">{resource.name}</span>
                      <span className="text-xs text-muted-foreground md:hidden">{resource.date}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="font-normal text-xs bg-muted text-muted-foreground border-0">
                    {resource.category}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                      {resource.uploadedBy.split(' ').map(n => n[0]).join('')}
                    </div>
                    <span className="text-sm text-muted-foreground truncate max-w-[120px]">
                      {resource.uploadedBy}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                  {resource.date}
                </TableCell>
                <TableCell className="text-right text-sm font-mono text-muted-foreground">
                  {resource.size}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        {resource.type === 'link' ? <ExternalLink className="w-4 h-4 mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                        {resource.type === 'link' ? 'Open Link' : 'Download'}
                      </DropdownMenuItem>
                      <DropdownMenuItem>Rename</DropdownMenuItem>
                      <DropdownMenuItem>Move to Folder</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            
            {filteredResources.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <Search className="w-8 h-8 mb-2 opacity-50" />
                    <p>No resources found matching your search.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
