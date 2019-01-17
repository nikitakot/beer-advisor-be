import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GraphQLResolveInfo } from 'graphql';
import { ChangeBeerInput, CommentBeerInput, CreateBeerInput, RateBeerInput, UpvoteBeerChangeInput } from '../graphql.schema.generated';
import { mapConnectIds } from '../shared/helpers';
import { Beer, BeerChange, BeerChangeUpvote, BeerComment, BeerRating, User } from '../prisma/prisma.bindings.generated';
import { ErrorService } from '../error/error.service';
import { ErrorCodes } from '../shared/enums/error-codes.enum';

@Injectable()
export class BeerService {
  constructor(private readonly prisma: PrismaService, private readonly errorService: ErrorService) {
  }

  getAllBeers(args, info: GraphQLResolveInfo): Promise<string> {
    return this.prisma.query.beers(args, info);
  }

  getBeer(id: string, info: GraphQLResolveInfo): Promise<Beer> {
    return this.prisma.query.beer({ where: { id } }, info);
  }

  createBeer(beer: CreateBeerInput, user: User, info: GraphQLResolveInfo): Promise<Beer> {
    return this.prisma.mutation.createBeer(
      {
        data: {
          name: beer.name,
          photo: beer.photo,
          type: beer.type,
          strong: beer.strong,
          createdBy: { connect: { id: user.id } },
          ...(beer.breweryId && { brewery: { connect: { id: beer.breweryId } } }), // TODO wtf not working without spread
          bars: { connect: mapConnectIds(beer.barIds) },
        },
      },
      info,
    );
  }

  commentBeer(comment: CommentBeerInput, user: User, info: GraphQLResolveInfo): Promise<BeerComment> {
    return this.prisma.mutation.createBeerComment(
      {
        data: {
          comment: comment.comment,
          user: { connect: { id: user.id } },
          beer: { connect: { id: comment.beerId } },
        },
      },
      info,
    );
  }

  async rateBeer(rating: RateBeerInput, user: User, info: GraphQLResolveInfo): Promise<BeerRating> {
    // TODO how to make one transaction
    const ratings = await this.prisma.query.beerRatings({
      where: { AND: { beer: { id: rating.beerId }, user: { id: user.id } } },
    });

    return this.prisma.mutation.upsertBeerRating(
      {
        where: { id: ratings && ratings.length && ratings[0].id },
        create: {
          rating: rating.rating,
          beer: { connect: { id: rating.beerId } },
          user: { connect: { id: user.id } },
        },
        update: {
          rating: rating.rating,
        },
      },
      info,
    );
  }

  changeBeer(change: ChangeBeerInput, user: User, info: GraphQLResolveInfo): Promise<BeerChange> {
    return this.prisma.mutation.createBeerChange(
      {
        data: {
          field: change.field,
          newValue: change.newValue,
          user: { connect: { id: user.id } },
          beer: { connect: { id: change.beerId } },
        },
      },
      info,
    );
  }

  async upvoteBeerChange(upvote: UpvoteBeerChangeInput, user: User, info: GraphQLResolveInfo): Promise<BeerChangeUpvote> {
    // TODO how to make one transaction
    const userAlreadyUpvoted = await this.prisma.exists.BeerChangeUpvote(
      {
        AND: { user: { id: user.id }, beerChange: { id: upvote.beerChangeId } },
      },
    );

    if (userAlreadyUpvoted) this.errorService.throwCustomError('User already upvoted the change', ErrorCodes.ALREADY_UPVOTED);

    const totalUpvotes = await this.prisma.query.beerChangeUpvotes({
        where: { beerChange: { id: upvote.beerChangeId } },
      },
    );

    if (totalUpvotes.length > 3) {
      this.applyBeerChange();
    }

    return this.prisma.mutation.createBeerChangeUpvote({
        data: {
          user: { connect: { id: user.id } },
          beerChange: { connect: { id: upvote.beerChangeId } },
        },
      },
      info,
    );
  }

  async applyBeerChange() {

  }
}
