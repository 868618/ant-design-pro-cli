# Cli for Ant Design Pro

## Commands

- screenshot 对区块进行截图
- i18n-remove 从项目中移除国际化
- fetch-blocks 下载 pro 所有的官方区块

## Options for the screenshot command

- --path 区块的路径，可以用于只截图一个

## Options for the i18n-remove command

- --locale 设置语言
- --write 是否写入文件

## Examples

### pro

pro -h

### screenshot

- pro screenshot
- pro screenshot --path DashboardWorkplace

### i18n-remove

- pro i18n-remove --write

- pro i18n-remove --locale en-US --write

### fetch-blocks

- pro fetch-blocks
