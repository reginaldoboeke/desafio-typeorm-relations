import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customerExists = await this.customersRepository.findById(customer_id);

    if (!customerExists) {
      throw new AppError('Could not find any customer with the given id');
    }

    const existentsProducts = await this.productsRepository.findAllById(
      products,
    );

    if (!existentsProducts.length) {
      throw new AppError('Could not find any products with the given ids');
    }

    const existentsProductsIds = existentsProducts.map(product => product.id);

    const checkInexistentProducts = products.filter(
      product => !existentsProductsIds.includes(product.id),
    );

    if (checkInexistentProducts.length) {
      throw new AppError(
        `Could not find products: ${checkInexistentProducts
          .map(product => product.id)
          .join(', ')}`,
      );
    }

    const findProductsWithNoQuantityAvailable = products.filter(product => {
      const checkProductQuantity = existentsProducts.find(
        findProduct => findProduct.id === product.id,
      );

      if (
        checkProductQuantity &&
        checkProductQuantity?.quantity < product.quantity
      ) {
        return checkProductQuantity;
      }
      return false;
    });

    if (findProductsWithNoQuantityAvailable.length) {
      throw new AppError(
        'There are one or more products with quantity unavailable',
      );
    }

    const serializedProducts = products.map(product => ({
      product_id: product.id,
      quantity: product.quantity,
      price: existentsProducts.find(p => p.id === product.id)?.price || 0,
    }));

    const order = await this.ordersRepository.create({
      customer: customerExists,
      products: serializedProducts,
    });

    const { order_products } = order;

    const orderedProductsQuantity = order_products.map(product => ({
      id: product.product_id,
      quantity:
        (existentsProducts.find(p => p.id === product.product_id)?.quantity ||
          0) - product.quantity,
    }));

    await this.productsRepository.updateQuantity(orderedProductsQuantity);

    return order;
  }
}

export default CreateOrderService;
