import { ExecArgs } from "@medusajs/framework/types"
import { createUsersWorkflow } from "@medusajs/medusa/core-flows"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function createAdminUser({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  logger.info("Creating admin user...")

  try {
    const { result } = await createUsersWorkflow(container).run({
      input: {
        users: [
          {
            email: "admin@medusajs.com",
            first_name: "Admin",
            last_name: "User",
          },
        ],
      },
    })

    logger.info("==================================================")
    logger.info("ADMIN USER CREATED SUCCESSFULLY!")
    logger.info("Email: admin@medusajs.com")
    logger.info("==================================================")
  } catch (error) {
    logger.error(`Error creating admin user: ${error}`)
  }
}
