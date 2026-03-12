# Contract: DNS Record for ecosystem-analytics.alkem.io
# This is the reference contract for the Terraform DNS configuration.
# To be added in alkem-io/infrastructure-provisioning/azure/dns/production/a-records.tf

resource "azurerm_dns_a_record" "ecosystem-analytics" {
  name                = "ecosystem-analytics"
  zone_name           = azurerm_dns_zone.alkemio.name
  resource_group_name = azurerm_resource_group.dns-alkemio.name
  ttl                 = 300
  records             = ["51.158.216.195"]
}
