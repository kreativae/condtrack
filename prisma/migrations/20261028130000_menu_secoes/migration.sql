-- Menu lateral: o novo estilo "Seções" passa a valer para todos (dá para voltar em Configurações → Aparência → Menu lateral)
UPDATE "Setting" SET "value" = '{"style":"sections"}', "updatedAt" = CURRENT_TIMESTAMP WHERE "key" = 'menu_style';
