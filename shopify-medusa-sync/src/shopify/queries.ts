// Product list query used for the sync. Keep this narrow — every extra field
// costs "query cost" against Shopify's GraphQL rate limit (see client.ts).
export const PRODUCTS_QUERY = /* GraphQL */ `
  query SyncProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          handle
          descriptionHtml
          status
          updatedAt
          images(first: 10) {
            edges {
              node {
                url
                altText
              }
            }
          }
          options {
            name
            values
          }
          collections(first: 10) {
            edges {
              node {
                id
                title
              }
            }
          }
          variants(first: 100) {
            edges {
              node {
                id
                title
                sku
                price
                inventoryQuantity
                selectedOptions {
                  name
                  value
                }
                inventoryItem {
                  id
                }
              }
            }
          }
        }
      }
    }
  }
`;
