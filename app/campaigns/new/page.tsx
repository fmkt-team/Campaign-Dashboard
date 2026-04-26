"use client";

import { useState } from "react";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";

export default function NewCampaignPage() {
  const router = useRouter();
  const createCampaign = useMutation(api.campaigns.createCampaign);
  
  const [formData, setFormData] = useState({
    name: "",
    brandColor: "#e50010",
    startDate: "",
    endDate: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate user ID for MVP
    const DUMMY_USER_ID = "admin_master_001"; 
    
    try {
      const newId = await createCampaign({
        name: formData.name,
        brandColor: formData.brandColor,
        startDate: formData.startDate,
        endDate: formData.endDate,
        createdBy: DUMMY_USER_ID
      });
      router.push(`/campaigns/${newId}/timeline`);
    } catch (error) {
      console.error(error);
      alert("Failed to create campaign. Check database connection or schema.");
    }
  };

  return (
    <div className="min-h-screen p-8 lg:p-12 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Create New Campaign</h1>
      
      <form onSubmit={handleSubmit}>
        <GlassCard className="flex flex-col gap-6">
          <div>
            <label className="block text-sm text-gray-500 mb-2">Campaign Name</label>
            <Input 
              required
              className="bg-gray-50 border-gray-200 text-gray-900" 
              placeholder="e.g. 2026 데스커 브랜드 마케팅"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm text-gray-500 mb-2">Start Date</label>
              <Input 
                required
                type="date"
                className="bg-gray-50 border-gray-200 text-gray-900 block w-full"
                value={formData.startDate}
                onChange={e => setFormData({ ...formData, startDate: e.target.value })} 
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-2">End Date (optional)</label>
              <Input 
                type="date"
                className="bg-gray-50 border-gray-200 text-gray-900 block w-full"
                value={formData.endDate}
                onChange={e => setFormData({ ...formData, endDate: e.target.value })} 
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-2">Brand Color</label>
            <div className="flex gap-4 items-center">
              <input 
                type="color" 
                className="w-12 h-12 rounded cursor-pointer bg-transparent border-0" 
                value={formData.brandColor}
                onChange={e => setFormData({ ...formData, brandColor: e.target.value })}
              />
              <span className="text-gray-700 font-mono">{formData.brandColor}</span>
            </div>
          </div>
          
          <div className="flex justify-end gap-4 mt-4 pt-6 border-t border-gray-100">
            <Button type="button" variant="ghost" className="text-gray-500 hover:bg-gray-50" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" className="bg-gray-900 text-white hover:bg-gray-800">Initialize Campaign</Button>
          </div>
        </GlassCard>
      </form>
    </div>
  );
}
