import { ApiError } from '../../utils/ApiError.js';
import { checkPincodeServiceability } from '../../lib/delhivery/pincode.js';
import { isDelhiveryConfigured, delhiveryConfigHint } from '../../lib/delhivery/config.js';
import {
  getShippingCharges,
  parcelLinesFromProducts,
  type ShippingChargesResult,
} from '../../lib/delhivery/shipping-charges.js';
import type { ProductRow } from '../products/products.types.js';
import { productsService } from '../products/products.service.js';

export class ShippingService {
  /**
   * Live Delhivery lookup. Never persist the result — coverage changes.
   * Fail closed: missing config or unserviceable PIN must block checkout.
   */
  async assertDeliverable(postalCode: string, payment: 'prepaid' | 'cod') {
    if (!isDelhiveryConfigured()) {
      throw ApiError.internal(`Shipping service is not configured. ${delhiveryConfigHint()}`);
    }

    const pin = await checkPincodeServiceability(postalCode);

    if (!pin.serviceable) {
      throw ApiError.badRequest(
        `We don't deliver to PIN ${pin.pincode} yet. Please use a different address.`
      );
    }

    if (payment === 'cod' && !pin.cod) {
      throw ApiError.badRequest(
        'Cash on delivery is not available for this PIN code. Please pay online.'
      );
    }

    if (payment === 'prepaid' && !pin.prepaid) {
      throw ApiError.badRequest(
        'Online payment delivery is not available for this PIN code. Try Cash on Delivery.'
      );
    }

    return pin;
  }

  async quoteBySlug(input: {
    destinationPin: string;
    slug: string;
    quantity: number;
    mot?: string;
    payment?: 'prepaid' | 'cod';
  }): Promise<ShippingChargesResult> {
    const product = await productsService.getBySlug(input.slug);
    if (!product) throw ApiError.notFound(`Product not found: ${input.slug}`);
    return this.quoteForProducts({
      destinationPin: input.destinationPin,
      items: [{ product, quantity: input.quantity }],
      mot: input.mot,
      payment: input.payment,
    });
  }

  async quoteForProducts(input: {
    destinationPin: string;
    items: Array<{ product: ProductRow; quantity: number }>;
    mot?: string;
    payment?: 'prepaid' | 'cod';
  }): Promise<ShippingChargesResult> {
    if (!isDelhiveryConfigured()) {
      throw ApiError.internal(`Shipping service is not configured. ${delhiveryConfigHint()}`);
    }

    return getShippingCharges({
      destinationPin: input.destinationPin,
      lines: parcelLinesFromProducts(input.items),
      mot: input.mot,
      payment: input.payment,
    });
  }
}

export const shippingService = new ShippingService();
