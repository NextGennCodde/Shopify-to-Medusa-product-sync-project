import { ExecArgs } from "@medusajs/framework/types"
import {
  createApiKeysWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

export default async function seedDemoData({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL)
  
  logger.info("Setting up Publishable API Key...")

  let salesChannels = await salesChannelModuleService.listSalesChannels()
  let defaultSalesChannel = salesChannels[0]

  if (!defaultSalesChannel) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: {
        salesChannelsData: [{ name: "Default Sales Channel" }],
      },
    })
    defaultSalesChannel = result[0]
  }

  // Create Publishable API Key
  const { result: apiKeyResult } = await createApiKeysWorkflow(container).run({
    input: {
      api_keys: [
        {
          title: "Storefront Key",
          type: "publishable",
          created_by: "system",
        },
      ],
    },
  })
  const publishableApiKey = apiKeyResult[0]

  // Link Sales Channel to API Key
  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: {
      id: publishableApiKey.id,
      add: [defaultSalesChannel.id],
    },
  })

  logger.info("==================================================")
  logger.info(`PUBLISHABLE_API_KEY=${publishableApiKey.token}`)
  logger.info("==================================================")
}
