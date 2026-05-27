-- aihu-language-server — Neovim lspconfig snippet
-- Prerequisites: aihu-language-server must be on $PATH (npm i -g @aihu/language-server)
-- Paste into your init.lua or a dedicated plugin config file.

-- Detect .aihu files as the 'aihu' filetype
vim.filetype.add({ extension = { aihu = 'aihu' } })

-- Configure the language server
require('lspconfig').setup_handlers {
  function(server_name)
    require('lspconfig')[server_name].setup {}
  end,
}

local lspconfig = require('lspconfig')
local configs = require('lspconfig.configs')

if not configs.aihu_ls then
  configs.aihu_ls = {
    default_config = {
      cmd = { 'aihu-language-server', '--stdio' },
      filetypes = { 'aihu' },
      root_dir = require('lspconfig.util').find_git_ancestor,
      single_file_support = true,
    },
  }
end

lspconfig.aihu_ls.setup {}
