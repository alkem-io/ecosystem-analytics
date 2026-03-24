import { useState } from "react";
import { 
  File, 
  FileText, 
  Image as ImageIcon, 
  Video, 
  MoreHorizontal, 
  Download, 
  Trash2, 
  Share2, 
  Eye, 
  Search, 
  Filter, 
  Folder,
  ArrowUpDown,
  Upload,
  Plus,
  MonitorPlay
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Badge } from "@/app/components/ui/badge";
import { Checkbox } from "@/app/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/app/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import { Separator } from "@/app/components/ui/separator";
import { cn } from "@/lib/utils";

// --- Types ---

type FileType = 'Document' | 'Whiteboard' | 'Image' | 'Video' | 'Folder' | 'Other';

interface StorageFile {
  id: string;
  name: string;
  type: FileType;
  size: number; // in bytes
  uploadedBy: string;
  uploadedAt: string; // ISO date
}

interface StorageUsage {
  used: number; // in bytes
  total: number; // in bytes
  breakdown: Record<FileType, number>;
}

// --- Mock Data ---

const MOCK_USAGE: StorageUsage = {
  used: 48318382080, // ~45 GB
  total: 107374182400, // 100 GB
  breakdown: {
    'Document': 10737418240, // 10 GB
    'Whiteboard': 5368709120, // 5 GB
    'Image': 21474836480, // 20 GB
    'Video': 10737418240, // 10 GB
    'Folder': 0,
    'Other': 0
  }
};

const MOCK_FILES: StorageFile[] = [
  { id: '1', name: 'Project Guidelines', type: 'Folder', size: 0, uploadedBy: 'Sarah Jenkins', uploadedAt: '2023-10-15T10:00:00Z' },
  { id: '2', name: 'Q4 Marketing Strategy.pdf', type: 'Document', size: 2450000, uploadedBy: 'Mike Ross', uploadedAt: '2023-11-01T14:30:00Z' },
  { id: '3', name: 'Design System Assets.zip', type: 'Other', size: 156000000, uploadedBy: 'Jessica Pearson', uploadedAt: '2023-11-02T09:15:00Z' },
  { id: '4', name: 'Brainstorming Session 1', type: 'Whiteboard', size: 4500000, uploadedBy: 'Harvey Specter', uploadedAt: '2023-11-03T11:20:00Z' },
  { id: '5', name: 'Team Offsite Photos.jpg', type: 'Image', size: 8500000, uploadedBy: 'Louis Litt', uploadedAt: '2023-11-05T16:45:00Z' },
  { id: '6', name: 'Product Demo.mp4', type: 'Video', size: 450000000, uploadedBy: 'Donna Paulsen', uploadedAt: '2023-11-06T13:10:00Z' },
  { id: '7', name: 'Meeting Notes - Nov 7', type: 'Document', size: 15000, uploadedBy: 'Rachel Zane', uploadedAt: '2023-11-07T10:00:00Z' },
  { id: '8', name: 'Financial Report Q3.xlsx', type: 'Document', size: 450000, uploadedBy: 'Louis Litt', uploadedAt: '2023-11-08T09:30:00Z' },
  { id: '9', name: 'User Journey Map', type: 'Whiteboard', size: 3200000, uploadedBy: 'Mike Ross', uploadedAt: '2023-11-09T15:20:00Z' },
  { id: '10', name: 'Logo Pack', type: 'Folder', size: 0, uploadedBy: 'Jessica Pearson', uploadedAt: '2023-10-20T11:00:00Z' },
];

// --- Helpers ---

const formatBytes = (bytes: number, decimals = 1) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const getFileIcon = (type: FileType) => {
  switch (type) {
    case 'Folder': return <Folder className="w-4 h-4 text-blue-500 fill-blue-500/20" />;
    case 'Document': return <FileText className="w-4 h-4 text-orange-500" />;
    case 'Image': return <ImageIcon className="w-4 h-4 text-purple-500" />;
    case 'Video': return <MonitorPlay className="w-4 h-4 text-red-500" />; // Changed from Video to MonitorPlay for clearer distinct icon or use Video
    case 'Whiteboard': return <MonitorPlay className="w-4 h-4 text-green-500" />; // Use a different one? Maybe PenTool? Let's use File for now or a specific one.
    default: return <File className="w-4 h-4 text-gray-500" />;
  }
};

// Override specifically for Whiteboard to be better
const getWhiteboardIcon = () => <div className="w-4 h-4 rounded-sm border-2 border-green-500 flex items-center justify-center bg-green-50"><div className="w-2 h-0.5 bg-green-500" /></div>;


export function SpaceSettingsStorage() {
  const [files, setFiles] = useState<StorageFile[]>(MOCK_FILES);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: keyof StorageFile, direction: 'asc' | 'desc' } | null>(null);

  // Sorting
  const sortedFiles = [...files].sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    if (a[key] < b[key]) return direction === 'asc' ? -1 : 1;
    if (a[key] > b[key]) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  // Filtering
  const filteredFiles = sortedFiles.filter(file => 
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Selection
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedFiles(filteredFiles.map(f => f.id));
    } else {
      setSelectedFiles([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedFiles(prev => [...prev, id]);
    } else {
      setSelectedFiles(prev => prev.filter(fileId => fileId !== id));
    }
  };

  const handleSort = (key: keyof StorageFile) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Storage Meter Logic
  const usagePercentage = (MOCK_USAGE.used / MOCK_USAGE.total) * 100;
  const getUsageColor = (p: number) => {
    if (p >= 90) return "bg-destructive";
    if (p >= 75) return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* 1. Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Storage</h2>
        <p className="text-muted-foreground mt-2">
          View and manage documents stored in this space. Here you can see the document storage for this space.
        </p>
      </div>

      <Separator />

      {/* 2. Storage Usage Section */}
      <div className="bg-muted/30 border rounded-lg p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="font-semibold text-base mb-1">Storage Usage</h3>
            <p className="text-sm text-muted-foreground">
              {formatBytes(MOCK_USAGE.used)} / {formatBytes(MOCK_USAGE.total)} used
            </p>
          </div>
          <Button variant="outline" size="sm">
            Upgrade Storage
          </Button>
        </div>

        {/* Progress Bar */}
        <div className="h-3 w-full bg-secondary rounded-full overflow-hidden mb-2">
          <div 
            className={cn("h-full transition-all duration-500", getUsageColor(usagePercentage))} 
            style={{ width: `${usagePercentage}%` }} 
          />
        </div>
        
        <div className="flex justify-between items-center text-xs text-muted-foreground mt-2">
          <span>{Math.round(usagePercentage)}% used</span>
          <span>Contact Alkemio team to upgrade your storage quota</span>
        </div>

        {/* Optional Breakdown (Simple text for now) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t">
           {Object.entries(MOCK_USAGE.breakdown).map(([type, size]) => {
             if (size === 0) return null;
             return (
               <div key={type}>
                 <p className="text-xs text-muted-foreground mb-1">{type}s</p>
                 <p className="font-medium text-sm">{formatBytes(size)}</p>
               </div>
             )
           })}
        </div>
      </div>

      {/* 3. Documents Table Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search documents..." 
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          {selectedFiles.length > 0 && (
             <div className="flex items-center gap-2 mr-2 animate-in fade-in slide-in-from-right-5">
               <span className="text-sm text-muted-foreground hidden sm:inline-block">
                 {selectedFiles.length} selected
               </span>
               <Button variant="destructive" size="sm" className="h-9">
                 <Trash2 className="w-4 h-4 mr-2" />
                 Delete
               </Button>
               <Button variant="outline" size="sm" className="h-9">
                 <Download className="w-4 h-4 mr-2" />
                 Download
               </Button>
             </div>
          )}
          <Button variant="outline" className="gap-2">
            <Filter className="w-4 h-4" />
            Filter
          </Button>
          <Button className="gap-2">
            <Upload className="w-4 h-4" />
            Upload
          </Button>
        </div>
      </div>

      {/* 4. Documents Table */}
      <div className="border rounded-md overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox 
                  checked={selectedFiles.length === filteredFiles.length && filteredFiles.length > 0}
                  onCheckedChange={(c) => handleSelectAll(!!c)}
                />
              </TableHead>
              <TableHead className="w-[400px]">
                <button 
                  onClick={() => handleSort('name')}
                  className="flex items-center gap-2 font-medium hover:text-foreground transition-colors"
                >
                  Name
                  <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                </button>
              </TableHead>
              <TableHead>
                 <button 
                  onClick={() => handleSort('size')}
                  className="flex items-center gap-2 font-medium hover:text-foreground transition-colors"
                >
                  Size
                  <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                </button>
              </TableHead>
              <TableHead>
                 <button 
                  onClick={() => handleSort('uploadedBy')}
                  className="flex items-center gap-2 font-medium hover:text-foreground transition-colors"
                >
                  Uploaded By
                  <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                </button>
              </TableHead>
              <TableHead>
                 <button 
                  onClick={() => handleSort('uploadedAt')}
                  className="flex items-center gap-2 font-medium hover:text-foreground transition-colors"
                >
                  Date
                  <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                </button>
              </TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredFiles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                     <File className="w-8 h-8 mb-2 opacity-20" />
                     <p>No documents found.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredFiles.map((file) => (
                <TableRow key={file.id}>
                  <TableCell>
                    <Checkbox 
                      checked={selectedFiles.includes(file.id)}
                      onCheckedChange={(c) => handleSelectOne(file.id, !!c)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {file.type === 'Whiteboard' ? getWhiteboardIcon() : getFileIcon(file.type)}
                      <span className="font-medium truncate max-w-[200px] sm:max-w-[300px]">
                        {file.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {file.type === 'Folder' ? '-' : formatBytes(file.size)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {file.uploadedBy}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(file.uploadedAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Download className="w-4 h-4 text-muted-foreground" />
                      </Button>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Share2 className="w-4 h-4 mr-2" />
                            Share
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Folder className="w-4 h-4 mr-2" />
                            Move to...
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination (Simple stub) */}
      <div className="flex items-center justify-between px-2">
         <p className="text-sm text-muted-foreground">
           Showing {filteredFiles.length} of {MOCK_FILES.length} documents
         </p>
         <div className="flex gap-2">
           <Button variant="outline" size="sm" disabled>Previous</Button>
           <Button variant="outline" size="sm" disabled>Next</Button>
         </div>
      </div>
    </div>
  );
}
