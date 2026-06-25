UPDATE settings
SET value = '["Purok 1","Purok 2","Purok 3","Purok 4","Purok 5","Purok 6","Purok 7","Purok 8","Purok 9","Purok 10","Purok 11A","Purok 11B","Purok 12","Purok 13","Purok 14","Purok 15","Purok 16","Purok 17","MSU-IIT","NCS"]'::jsonb
WHERE key = 'puroks';
